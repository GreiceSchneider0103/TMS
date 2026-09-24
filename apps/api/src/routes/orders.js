import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { logAudit, logSyncJob } from '../services/audit.js';
import { parseIntWithBounds } from '../utils/validation.js';
import { HttpError } from '../utils/router.js';
import { normalizeMeasures, parseDecimal } from '../services/units.js';
import { addBusinessDays } from '../services/deadlines.js';
import { processOrderIntake } from '../services/orderIntake.js';
import { pushTinyStatus, syncTinyOrders } from '../services/tiny/tinySync.js';


export function registerOrderRoutes(app) {
  app.get('/orders', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador', 'analista_integracao'], async ({ ctx, query: qs }) => {
    const limit = parseIntWithBounds(qs.limit, 50, { fieldName: 'limit', min: 1, max: 500 });
    const offset = parseIntWithBounds(qs.offset, 0, { fieldName: 'offset', min: 0, max: 1000000 });

    const conditions = ['o.account_id = $1'];
    const params = [ctx.accountId];

    if (qs.status) {
      params.push(String(qs.status));
      conditions.push(`o.status = $${params.length}`);
    }
    if (qs.carrier) {
      params.push(`%${String(qs.carrier)}%`);
      conditions.push(`exists (
        select 1 from app.shipments s join app.carriers c on c.id = s.carrier_id
        where s.account_id = $1 and s.order_id = o.id and c.name ilike $${params.length}
      )`);
    }
    if (qs.from) {
      params.push(String(qs.from));
      conditions.push(`o.created_at >= $${params.length}`);
    }
    if (qs.to) {
      params.push(String(qs.to));
      conditions.push(`o.created_at < ($${params.length}::date + interval '1 day')`);
    }

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const { rows } = await query(
      `select o.*,
              coalesce(r.legal_name, o.raw_payload->>'recipient_name') as recipient_name,
              coalesce(r.postal_code, o.raw_payload->>'postal_code') as destination_postal_code,
              coalesce(sh.carrier_name, sq.carrier_name) as carrier_name,
              sh.id as shipment_id, sh.tracking_code, sh.shipment_status, sh.dispatched_at, sh.estimated_delivery_date, sh.delivered_at,
              sq.id as selected_quote_result_id, sq.total_amount as selected_quote_amount
       from app.orders o
       left join app.recipients r on r.id = o.recipient_id and r.account_id = $1
       left join lateral (
         select s.id, s.tracking_code, s.status as shipment_status, s.dispatched_at, s.estimated_delivery_date, s.delivered_at, c.name as carrier_name
         from app.shipments s left join app.carriers c on c.id = s.carrier_id
         where s.account_id = $1 and s.order_id = o.id order by s.created_at desc limit 1
       ) sh on true
       left join lateral (
         select qr.id, qr.total_amount, c.name as carrier_name from app.quote_results qr
         join app.quote_requests qreq on qreq.id = qr.request_id
         left join app.carriers c on c.id = qr.carrier_id
         where qr.account_id = $1 and qreq.order_id = o.id and qr.selected = true
         order by qr.created_at desc limit 1
       ) sq on true
       where ${conditions.join(' and ')}
       order by o.created_at desc limit $${limitIdx} offset $${offsetIdx}`,
      params
    );
    return { items: rows, total: rows.length, correlationId: ctx.correlationId };
  }));

  app.get('/orders/:id', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador', 'analista_integracao'], async ({ ctx, params }) => {
    const { rows } = await query(`select * from app.orders where account_id = $1 and id = $2`, [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Order not found');
    const items = await query(`select * from app.order_items where account_id = $1 and order_id = $2`, [ctx.accountId, params.id]);
    const shipments = await query(
      `select s.id, s.status, s.tracking_code, s.created_at, s.dispatched_at, s.estimated_delivery_date, s.transit_days, s.delivered_at, s.delivered_to,
              s.tracking_source, s.invoice_number, c.name as carrier_name
       from app.shipments s left join app.carriers c on c.id = s.carrier_id
       where s.account_id = $1 and s.order_id = $2 order by s.created_at desc`,
      [ctx.accountId, params.id]
    );
    return { ...rows[0], items: items.rows, shipments: shipments.rows, correlationId: ctx.correlationId };
  }));

  // Corrige dados de entrega/medidas e prazos do pedido (ex.: CEP inválido vindo do canal).
  app.patch('/orders/:id', requireAnyRole(['operador_logistico'], async ({ ctx, params, body }) => {
    const current = await query('select * from app.orders where account_id = $1 and id = $2', [ctx.accountId, params.id]);
    if (!current.rows[0]) throw new Error('Order not found');
    const patch = {};
    if (body.postalCode !== undefined) {
      const cep = String(body.postalCode || '').replace(/\D/g, '');
      if (cep.length !== 8) throw new HttpError(400, 'O CEP deve ter 8 dígitos.');
      patch.postal_code = cep;
    }
    if (body.city !== undefined) patch.city = String(body.city || '').trim() || null;
    if (body.state !== undefined) patch.state = String(body.state || '').trim().toUpperCase() || null;
    if (body.recipientType !== undefined) patch.recipient_type = body.recipientType === 'PJ' ? 'PJ' : 'PF';
    const m = normalizeMeasures(body);
    if (m.weightKg) patch.weight_kg = m.weightKg;
    if (m.lengthCm) patch.length_cm = m.lengthCm;
    if (m.widthCm) patch.width_cm = m.widthCm;
    if (m.heightCm) patch.height_cm = m.heightCm;

    const { rows } = await query(
      `update app.orders set raw_payload = raw_payload || $3::jsonb,
         sold_at = case when $4::boolean then $5::timestamptz else sold_at end,
         ship_by_date = case when $6::boolean then $7::timestamptz else ship_by_date end,
         promised_delivery_date = case when $8::boolean then $9::date else promised_delivery_date end,
         marketplace_carrier = case when $10::boolean then $11 else marketplace_carrier end,
         shipping_amount = case when $12::boolean then $13::numeric else shipping_amount end,
         updated_at = now()
       where account_id = $1 and id = $2 returning *`,
      [ctx.accountId, params.id, JSON.stringify(patch),
        body.soldAt !== undefined, body.soldAt || null,
        body.shipByDate !== undefined, body.shipByDate || null,
        body.promisedDeliveryDate !== undefined, body.promisedDeliveryDate || null,
        body.marketplaceCarrier !== undefined, body.marketplaceCarrier ? String(body.marketplaceCarrier).trim() : null,
        body.shippingAmount !== undefined, body.shippingAmount === '' || body.shippingAmount === null ? null : Number(String(body.shippingAmount).replace(',', '.'))]
    );
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'order', entityId: params.id, action: 'update', afterData: { ...patch, status: rows[0].status }, correlationId: ctx.correlationId });

    // Havia pendência de integração? Reprocessa já com os dados corrigidos.
    const open = await query("select source from app.integration_issues where account_id = $1 and order_id = $2 and status = 'aberto' limit 1", [ctx.accountId, params.id]);
    const intake = open.rows[0] ? await processOrderIntake({ accountId: ctx.accountId, orderId: params.id, source: open.rows[0].source }) : null;
    return { ...rows[0], intake, correlationId: ctx.correlationId };
  }));

  // Despacho manual: para transportadoras sem integração de rastreio por API.
  app.post('/orders/:id/manual-dispatch', requireAnyRole(['operador_logistico'], async ({ ctx, params, body }) => {
    const orderRes = await query('select * from app.orders where account_id = $1 and id = $2', [ctx.accountId, params.id]);
    const order = orderRes.rows[0];
    if (!order) throw new Error('Order not found');
    if (!body.carrierId) throw new HttpError(400, 'Escolha a transportadora.');
    const carrier = await query('select id, name from app.carriers where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, body.carrierId]);
    if (!carrier.rows[0]) throw new Error('Carrier not found');
    const open = await query("select id from app.shipments where account_id = $1 and order_id = $2 and status not in ('CANCELED','RETURNED') limit 1", [ctx.accountId, params.id]);
    if (open.rows[0]) throw new HttpError(409, 'Este pedido já tem um embarque. Registre as atualizações nele.');

    // Usa a cotação selecionada quando for da mesma transportadora (valor e prazo contratados).
    const quote = await query(
      `select qr.id, qr.total_amount, qr.total_days from app.quote_results qr join app.quote_requests q on q.id = qr.request_id
       where qr.account_id = $1 and q.order_id = $2 and qr.selected = true and qr.carrier_id = $3 order by qr.created_at desc limit 1`,
      [ctx.accountId, params.id, body.carrierId]
    );
    let service = null;
    if (body.carrierServiceId) {
      const sv = await query('select id, sla_days from app.carrier_services where account_id = $1 and id = $2 and carrier_id = $3', [ctx.accountId, body.carrierServiceId, body.carrierId]);
      if (!sv.rows[0]) throw new HttpError(400, 'Serviço não pertence a esta transportadora.');
      service = sv.rows[0];
    }
    const dispatchedAt = body.dispatchedAt ? new Date(body.dispatchedAt) : new Date();
    if (Number.isNaN(dispatchedAt.getTime())) throw new HttpError(400, 'Data de despacho inválida.');
    const transitDays = body.transitDays !== undefined && body.transitDays !== '' ? Number(body.transitDays) : (quote.rows[0]?.total_days ?? service?.sla_days ?? null);
    const estimated = transitDays !== null && Number.isFinite(transitDays) ? addBusinessDays(dispatchedAt, transitDays) : null;
    const freightAmount = body.freightAmount !== undefined && body.freightAmount !== '' ? Number(String(body.freightAmount).replace(',', '.')) : null;
    const nf = await query("select numero from app.order_invoices where account_id = $1 and order_id = $2 order by case kind when 'remessa' then 0 when 'venda' then 1 else 2 end limit 1", [ctx.accountId, params.id]);

    const shipment = await transaction(async (client) => {
      const ins = await client.query(
        `insert into app.shipments(account_id, order_id, quote_result_id, carrier_id, carrier_service_id, tracking_code, invoice_number, status,
           dispatched_at, transit_days, estimated_delivery_date, freight_amount, tracking_source, idempotency_key)
         values($1,$2,$3,$4,$5,$6,$7,'DISPATCHED',$8,$9,$10,$11,'manual',$12) returning *`,
        [ctx.accountId, params.id, quote.rows[0]?.id || null, body.carrierId, body.carrierServiceId || null, body.trackingCode ? String(body.trackingCode).trim() : null,
          body.invoiceNumber ? String(body.invoiceNumber).trim() : (nf.rows[0]?.numero || null), dispatchedAt.toISOString(), transitDays, estimated, freightAmount,
          `manual-${params.id}-${dispatchedAt.getTime()}`]
      );
      const s = ins.rows[0];
      if (body.weightKg) {
        await client.query('insert into app.shipment_packages(account_id, shipment_id, package_number, weight_kg) values($1,$2,1,$3)', [ctx.accountId, s.id, Number(body.weightKg)]);
      }
      await client.query(
        `insert into app.tracking_events(account_id, shipment_id, occurred_at, external_status, macro_status, raw_payload, external_event_id)
         values($1,$2,$3,'Despachado (registro manual)','DISPATCHED',$4,$5)`,
        [ctx.accountId, s.id, dispatchedAt.toISOString(), JSON.stringify({ manual: true }), `manual-${crypto.randomUUID()}`]
      );
      await client.query("update app.orders set status = 'DISPATCHED', updated_at = now() where account_id = $1 and id = $2", [ctx.accountId, params.id]);
      return s;
    });

    void pushTinyStatus({ accountId: ctx.accountId, orderId: params.id, status: 'DISPATCHED', trackingCode: shipment.tracking_code, carrierName: carrier.rows[0].name });
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'shipment', entityId: shipment.id, action: 'manual_dispatch', afterData: { carrier: carrier.rows[0].name, trackingCode: shipment.tracking_code }, correlationId: ctx.correlationId });
    return { ...shipment, correlationId: ctx.correlationId };
  }));

  app.post('/orders/import/tiny', requireAnyRole(['operador_logistico', 'analista_integracao'], async ({ ctx, body }) => {
    // Sem lista de pedidos no corpo: busca direto no Tiny pela API v3 (conexão em Configurações > Tiny ERP).
    if (!body.orders) {
      const result = await syncTinyOrders({ accountId: ctx.accountId, correlationId: ctx.correlationId, daysBack: body.daysBack });
      return { importedCount: result.imported + result.updated, ...result, correlationId: ctx.correlationId };
    }
    const idempotencyKey = String(body.idempotencyKey || `tiny-import-${body.page || 1}-${body.limit || 50}`);

    const existingJob = await query(
      `select * from app.sync_jobs where account_id = $1 and kind = 'tiny_import_orders' and idempotency_key = $2 limit 1`,
      [ctx.accountId, idempotencyKey]
    );
    if (existingJob.rows[0]?.status === 'success') {
      return { reused: true, syncJobId: existingJob.rows[0].id, correlationId: ctx.correlationId };
    }

    let payload;
    try {
      payload = { orders: body.orders };
      await logSyncJob({ accountId: ctx.accountId, kind: 'tiny_import_orders', status: 'success', payload: body, response: payload, idempotencyKey, correlationId: ctx.correlationId });
    } catch (error) {
      await logSyncJob({
        accountId: ctx.accountId,
        kind: 'tiny_import_orders',
        status: 'error',
        payload: body,
        error: JSON.stringify({ message: error.message, status: error.status || null, details: error.details || null }),
        attempts: 1,
        idempotencyKey,
        correlationId: ctx.correlationId
      });
      throw error;
    }

    const orders = payload.orders || [];
    if (!Array.isArray(orders)) throw new Error('Tiny payload inválido: lista de pedidos ausente');
    const imported = [];

    await transaction(async (client) => {
      for (const o of orders) {
        const externalId = String(o.id || o.external_id || o.numero || crypto.randomUUID());
        const totalAmount = Number(o.total || o.total_amount || 0);
        const invoiceAmount = Number(o.invoice_amount || o.total || o.total_amount || 0);
        const upsert = await client.query(
          `insert into app.orders(account_id, external_id, order_number, channel, total_amount, invoice_amount, status, raw_payload, shipping_amount)
           values($1,$2,$3,$4,$5,$6,'READY_FOR_QUOTE',$7,$8)
           on conflict (account_id, external_id)
           do update set order_number = excluded.order_number, channel = excluded.channel, total_amount = excluded.total_amount,
             invoice_amount = excluded.invoice_amount, raw_payload = excluded.raw_payload,
             shipping_amount = coalesce(excluded.shipping_amount, app.orders.shipping_amount), updated_at = now()
           returning *`,
          [ctx.accountId, externalId, String(o.number || o.numero || externalId), String(o.channel || o.canal || 'tiny'), totalAmount, invoiceAmount, o.raw || o, erpShippingAmount(o)]
        );
        imported.push(upsert.rows[0]);
      }
    });

    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'order', entityId: imported[0]?.id || 'batch', action: 'tiny_import', afterData: { count: imported.length }, correlationId: ctx.correlationId });
    return { importedCount: imported.length, imported, correlationId: ctx.correlationId };
  }));
}

// Frete cobrado do cliente no pedido de venda do ERP (Tiny: valor_frete; aceita também nomes genéricos).
function erpShippingAmount(o = {}) {
  const v = o.valor_frete ?? o.valorFrete ?? o.frete ?? o.shipping_amount ?? o.shippingAmount ?? o.raw?.valor_frete ?? null;
  if (v === null || v === undefined || v === '') return null;
  const n = parseDecimal(v);
  return n !== null && n >= 0 ? n : null;
}
