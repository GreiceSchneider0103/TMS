import { HttpError } from '../utils/router.js';
import { query, transaction } from '../db.js';
import { ShopeeClient } from './shopeeClient.js';
import { processOrderIntake } from './orderIntake.js';
import { recordIssue } from './integrationIssues.js';
import { addBusinessDays } from './deadlines.js';

const ORDER_STATUS_MAP = {
  UNPAID: 'CREATED',
  READY_TO_SHIP: 'READY_FOR_QUOTE',
  PROCESSED: 'READY_FOR_QUOTE',
  SHIPPED: 'DISPATCHED',
  TO_CONFIRM_RECEIVE: 'IN_TRANSIT',
  IN_CANCEL: 'EXCEPTION',
  CANCELLED: 'CANCELED',
  TO_RETURN: 'RETURNED',
  COMPLETED: 'DELIVERED'
};

export async function getActiveShopeeShops(accountId) {
  const { rows } = await query('select * from app.shopee_shops where account_id = $1 and is_active = true', [accountId]);
  return rows;
}

export async function getValidAccessToken(shop) {
  const expiresInMs = new Date(shop.token_expires_at).getTime() - Date.now();
  if (expiresInMs > 5 * 60 * 1000) return shop.access_token;

  const client = new ShopeeClient({ isSandbox: shop.is_sandbox });
  const refreshed = await client.refreshTokens({ refreshToken: shop.refresh_token, shopId: shop.shop_id });

  const expiresAt = new Date(Date.now() + Number(refreshed.expire_in || 0) * 1000);
  await query(
    `update app.shopee_shops set access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = now()
     where id = $4`,
    [refreshed.access_token, refreshed.refresh_token, expiresAt.toISOString(), shop.id]
  );
  return refreshed.access_token;
}

export async function syncShopOrders({ accountId, shop, correlationId }) {
  const client = new ShopeeClient({ isSandbox: shop.is_sandbox });
  const accessToken = await getValidAccessToken(shop);

  const timeTo = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - 15 * 24 * 60 * 60;

  const listRes = await client.shopRequest('/api/v2/order/get_order_list', {
    accessToken,
    shopId: shop.shop_id,
    query: {
      time_range_field: 'update_time',
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 50,
      order_status: 'READY_TO_SHIP'
    }
  });

  const orderSns = (listRes?.response?.order_list || []).map((o) => o.order_sn);
  if (!orderSns.length) return { synced: 0, quoted: 0 };

  const detailRes = await client.shopRequest('/api/v2/order/get_order_detail', {
    accessToken,
    shopId: shop.shop_id,
    query: {
      order_sn_list: orderSns.join(','),
      response_optional_fields: 'item_list,recipient_address,total_amount,weight,shipping_carrier,checkout_shipping_carrier,estimated_shipping_fee'
    }
  });

  const orders = detailRes?.response?.order_list || [];
  let synced = 0;
  let quoted = 0;

  for (const shopeeOrder of orders) {
    try {
      const shipping = await fetchBuyerShipping({ client, accessToken, shop, shopeeOrder });
      const orderRow = await upsertOrder({ accountId, shop, shopeeOrder, shipping });
      synced += 1;
      const intake = await processOrderIntake({ accountId, orderId: orderRow.id, source: 'shopee' });
      if (intake.quoted) quoted += 1;
    } catch (error) {
      await recordIssue({ accountId, source: 'shopee', reason: 'erro_integracao', externalRef: shopeeOrder.order_sn, message: error.message, details: { orderSn: shopeeOrder.order_sn } });
    }
  }

  await query('update app.shopee_shops set last_synced_at = now() where id = $1', [shop.id]);
  return { synced, quoted };
}

// Frete pago pelo comprador: vem do detalhe financeiro do pedido (escrow). Se não estiver disponível,
// usa o frete estimado do próprio pedido, marcando a origem para conferência.
async function fetchBuyerShipping({ client, accessToken, shop, shopeeOrder }) {
  try {
    const res = await client.shopRequest('/api/v2/payment/get_escrow_detail', { accessToken, shopId: shop.shop_id, query: { order_sn: shopeeOrder.order_sn } });
    const fee = res?.response?.order_income?.buyer_paid_shipping_fee;
    if (fee !== undefined && fee !== null && Number.isFinite(Number(fee))) return { amount: Number(fee), source: 'shopee_escrow' };
  } catch {
    // Escrow indisponível (ex.: pedido ainda não liberado): cai no valor do pedido.
  }
  const est = shopeeOrder.estimated_shipping_fee;
  if (est !== undefined && est !== null && Number.isFinite(Number(est))) return { amount: Number(est), source: 'shopee_pedido' };
  return { amount: null, source: null };
}

async function upsertOrder({ accountId, shop, shopeeOrder, shipping = { amount: null, source: null } }) {
  const externalId = `shopee-${shopeeOrder.order_sn}`;
  const address = shopeeOrder.recipient_address || {};
  const postalCode = String(address.zipcode || '').replace(/\D/g, '') || '00000000';
  const totalAmount = Number(shopeeOrder.total_amount || 0);
  const weightKg = Number(shopeeOrder.weight || 1);
  const status = ORDER_STATUS_MAP[shopeeOrder.order_status] || 'CREATED';

  const rawPayload = {
    postal_code: postalCode,
    state: address.state || null,
    city: address.city || null,
    weight_kg: weightKg,
    length_cm: 10,
    width_cm: 10,
    height_cm: 10,
    recipient_type: 'PF',
    skus: (shopeeOrder.item_list || []).map((i) => i.item_sku).filter(Boolean),
    categories: [],
    shopee_order_sn: shopeeOrder.order_sn,
    shopee_shop_id: shop.shop_id,
    ...(shipping.source ? { shipping_amount_source: shipping.source } : {})
  };

  const toTs = (unix) => (unix ? new Date(Number(unix) * 1000).toISOString() : null);
  const carrierName = shopeeOrder.shipping_carrier || shopeeOrder.checkout_shipping_carrier || null;

  const { rows } = await query(
    `insert into app.orders(account_id, external_id, order_number, channel, total_amount, invoice_amount, status, raw_payload, sold_at, ship_by_date, marketplace_carrier, shipping_amount)
     values($1,$2,$3,'shopee',$4,$4,$5,$6,$7,$8,$9,$10)
     on conflict (account_id, external_id) do update set
       total_amount = excluded.total_amount,
       invoice_amount = excluded.invoice_amount,
       status = case when app.orders.status in ('CREATED','READY_FOR_QUOTE') then excluded.status else app.orders.status end,
       raw_payload = app.orders.raw_payload || excluded.raw_payload,
       sold_at = coalesce(app.orders.sold_at, excluded.sold_at),
       ship_by_date = coalesce(excluded.ship_by_date, app.orders.ship_by_date),
       marketplace_carrier = coalesce(excluded.marketplace_carrier, app.orders.marketplace_carrier),
       shipping_amount = coalesce(excluded.shipping_amount, app.orders.shipping_amount),
       updated_at = now()
     returning *`,
    [accountId, externalId, shopeeOrder.order_sn, totalAmount, status, JSON.stringify(rawPayload), toTs(shopeeOrder.create_time), toTs(shopeeOrder.ship_by_date), carrierName, shipping.amount]
  );
  return rows[0];
}


async function loadShopeeOrderContext(accountId, orderId) {
  const orderRes = await query('select * from app.orders where account_id = $1 and id = $2', [accountId, orderId]);
  const order = orderRes.rows[0];
  if (!order) throw new Error('Order not found');
  if (order.channel !== 'shopee') throw new Error('Order is not a Shopee order');

  const shopId = order.raw_payload?.shopee_shop_id;
  const orderSn = order.raw_payload?.shopee_order_sn;
  if (!shopId || !orderSn) throw new Error('Order is missing Shopee shop/order reference');

  const shopRes = await query('select * from app.shopee_shops where account_id = $1 and shop_id = $2', [accountId, String(shopId)]);
  const shop = shopRes.rows[0];
  if (!shop) throw new Error('Shopee shop not connected');

  const client = new ShopeeClient({ isSandbox: shop.is_sandbox });
  const accessToken = await getValidAccessToken(shop);
  return { order, orderSn, shop, client, accessToken };
}

// Envia à Shopee os dados da NF-e de venda do pedido (obrigatório no Brasil antes do envio).
export async function sendShopeeInvoice({ accountId, orderId, context = null }) {
  const { orderSn, shop, client, accessToken } = context || await loadShopeeOrderContext(accountId, orderId);
  const inv = await query(
    `select id, chave, numero, serie, data_emissao, valor_total, valor_produtos, cfop from app.order_invoices
     where account_id = $1 and order_id = $2 and kind = 'venda' order by data_emissao desc nulls last limit 1`,
    [accountId, orderId]
  );
  const nf = inv.rows[0];
  if (!nf) throw new HttpError(400, 'Este pedido não tem NF-e de venda cadastrada.');

  await client.shopRequest('/api/v2/order/add_invoice_data', {
    method: 'POST',
    accessToken,
    shopId: shop.shop_id,
    body: {
      order_sn: orderSn,
      invoice_data: {
        number: String(nf.numero || ''),
        series_number: String(nf.serie || ''),
        access_key: nf.chave,
        issue_date: nf.data_emissao ? Math.floor(new Date(nf.data_emissao).getTime() / 1000) : Math.floor(Date.now() / 1000),
        total_value: Number(nf.valor_total || 0),
        products_total_value: Number(nf.valor_produtos ?? nf.valor_total ?? 0),
        tax_code: String(nf.cfop || '')
      }
    }
  });
  await query('update app.order_invoices set shopee_sent_at = now(), updated_at = now() where account_id = $1 and id = $2', [accountId, nf.id]);
  return { sent: true, invoiceNumber: nf.numero };
}

export async function dispatchShopeeOrder({ accountId, orderId, correlationId }) {
  const context = await loadShopeeOrderContext(accountId, orderId);
  const { orderSn, shop, client, accessToken } = context;

  // Se houver NF de venda ainda não enviada, envia antes de despachar. Falha aqui não bloqueia o despacho.
  let invoiceWarning = null;
  const pendingNf = await query("select 1 from app.order_invoices where account_id = $1 and order_id = $2 and kind = 'venda' and shopee_sent_at is null limit 1", [accountId, orderId]);
  if (pendingNf.rows[0]) {
    try {
      await sendShopeeInvoice({ accountId, orderId, context });
    } catch (error) {
      invoiceWarning = `NF não enviada à Shopee: ${error.message}`;
    }
  }

  const paramRes = await client.shopRequest('/api/v2/logistics/get_shipping_parameter', {
    accessToken,
    shopId: shop.shop_id,
    query: { order_sn: orderSn }
  });

  const pickup = paramRes?.response?.pickup?.address_list?.[0];
  const pickupTimeId = pickup?.time_slot_list?.[0]?.pickup_time_id;
  const shipPayload = {
    order_sn: orderSn,
    pickup: pickup ? { address_id: pickup.address_id, pickup_time_id: pickupTimeId } : undefined
  };

  await client.shopRequest('/api/v2/logistics/ship_order', {
    method: 'POST',
    accessToken,
    shopId: shop.shop_id,
    body: shipPayload
  });

  const trackingRes = await client.shopRequest('/api/v2/logistics/get_tracking_number', {
    accessToken,
    shopId: shop.shop_id,
    query: { order_sn: orderSn }
  });
  const trackingCode = trackingRes?.response?.tracking_number || null;

  const quoteRes = await query(
    `select id, carrier_id, total_days from app.quote_results where account_id = $1 and request_id = (
       select id from app.quote_requests where account_id = $1 and order_id = $2 order by created_at desc limit 1
     ) and selected = true limit 1`,
    [accountId, orderId]
  );
  const selectedQuote = quoteRes.rows[0];

  const idempotencyKey = `shopee-${orderSn}`;
  const shipment = await transaction(async (client2) => {
    const existing = await client2.query('select * from app.shipments where account_id = $1 and idempotency_key = $2', [accountId, idempotencyKey]);
    let row;
    if (existing.rows[0]) {
      const upd = await client2.query(
        'update app.shipments set tracking_code = $1, updated_at = now() where id = $2 returning *',
        [trackingCode, existing.rows[0].id]
      );
      row = upd.rows[0];
    } else {
      const ins = await client2.query(
        `insert into app.shipments(account_id, order_id, quote_result_id, carrier_id, tracking_code, status, idempotency_key, dispatched_at, transit_days, estimated_delivery_date)
         values($1,$2,$3,$4,$5,'DISPATCHED',$6, now(), $7, $8)
         returning *`,
        [accountId, orderId, selectedQuote?.id || null, selectedQuote?.carrier_id || null, trackingCode, idempotencyKey,
          selectedQuote?.total_days ?? null, selectedQuote?.total_days != null ? addBusinessDays(new Date(), selectedQuote.total_days) : null]
      );
      row = ins.rows[0];
    }
    await client2.query("update app.orders set status = 'DISPATCHED', updated_at = now() where account_id = $1 and id = $2", [accountId, orderId]);
    return row;
  });

  return { shipment, trackingCode, invoiceWarning, correlationId };
}
