import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { logAudit } from '../services/audit.js';
import { HttpError } from '../utils/router.js';
import { addBusinessDays } from '../services/deadlines.js';
import { pushTinyStatus } from '../services/tiny/tinySync.js';

export function registerShipmentRoutes(app) {
  app.get('/shipments', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query(
      `select s.*, c.name as carrier_name, o.order_number, o.channel
       from app.shipments s
       left join app.carriers c on c.id = s.carrier_id
       left join app.orders o on o.id = s.order_id
       where s.account_id = $1 order by s.created_at desc limit 100`,
      [ctx.accountId]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/shipments/:id', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador'], async ({ ctx, params }) => {
    const shipment = await query(
      `select s.*, c.name as carrier_name, o.order_number, o.channel, qr.total_amount as quoted_amount, qr.total_days
       from app.shipments s
       left join app.carriers c on c.id = s.carrier_id
       left join app.orders o on o.id = s.order_id
       left join app.quote_results qr on qr.id = s.quote_result_id
       where s.account_id = $1 and s.id = $2`,
      [ctx.accountId, params.id]
    );
    if (!shipment.rows[0]) throw new Error('Shipment not found');
    const packages = await query('select * from app.shipment_packages where account_id = $1 and shipment_id = $2 order by package_number', [ctx.accountId, params.id]);
    const tracking = await query('select * from app.tracking_events where account_id = $1 and shipment_id = $2 order by occurred_at desc', [ctx.accountId, params.id]);
    return { ...shipment.rows[0], packages: packages.rows, tracking: tracking.rows, correlationId: ctx.correlationId };
  }));

  app.post('/shipments', requireAnyRole(['operador_logistico'], async ({ ctx, body }) => {
    const idempotencyKey = String(body.idempotencyKey || crypto.createHash('sha256').update(`${body.orderId}-${body.quoteResultId}-${body.trackingCode || ''}`).digest('hex'));

    const existingByIdempotency = await query('select * from app.shipments where account_id = $1 and idempotency_key = $2 limit 1', [ctx.accountId, idempotencyKey]);
    if (existingByIdempotency.rows[0]) {
      await updateOrderStatusFromShipment({ accountId: ctx.accountId, orderId: body.orderId });
      return { ...existingByIdempotency.rows[0], reused: true, correlationId: ctx.correlationId };
    }

    const existingByOrderQuote = await query(`select * from app.shipments where account_id = $1 and order_id = $2 and quote_result_id = $3 limit 1`, [ctx.accountId, body.orderId, body.quoteResultId]);
    if (existingByOrderQuote.rows[0]) {
      await updateOrderStatusFromShipment({ accountId: ctx.accountId, orderId: body.orderId });
      return { ...existingByOrderQuote.rows[0], reused: true, correlationId: ctx.correlationId };
    }

    const result = await transaction(async (client) => {
      const quoteRes = await client.query('select * from app.quote_results where account_id = $1 and id = $2', [ctx.accountId, body.quoteResultId]);
      if (!quoteRes.rows[0]) throw new Error('Quote result not found');
      const q = quoteRes.rows[0];

      const orderQ = await client.query('select * from app.orders where account_id = $1 and id = $2', [ctx.accountId, body.orderId]);
      if (!orderQ.rows[0]) throw new Error('Order not found');

      let shipment;
      try {
        const ins = await client.query(
          `insert into app.shipments(account_id, order_id, quote_result_id, carrier_id, carrier_service_id, tracking_code, invoice_number, cte_number, status, idempotency_key,
             dispatched_at, transit_days, estimated_delivery_date)
           values($1,$2,$3,$4,$5,$6,$7,$8,'DISPATCHED',$9, now(), $10, $11)
           returning *`,
          [ctx.accountId, body.orderId, body.quoteResultId, q.carrier_id, body.carrierServiceId || null, body.trackingCode || null, body.invoiceNumber || null, body.cteNumber || null, idempotencyKey,
            q.total_days ?? null, q.total_days != null ? addBusinessDays(new Date(), q.total_days) : null]
        );
        shipment = ins.rows[0];
      } catch (error) {
        if (error?.code !== '23505') throw error;
        const raceSafe = await client.query(`select * from app.shipments where account_id = $1 and (idempotency_key = $2 or (order_id = $3 and quote_result_id = $4)) order by created_at desc limit 1`, [ctx.accountId, idempotencyKey, body.orderId, body.quoteResultId]);
        if (!raceSafe.rows[0]) throw error;
        shipment = raceSafe.rows[0];
      }

      const packages = body.packages || [{ package_number: 1, weight_kg: body.weightKg || 1 }];
      for (const p of packages) {
        await client.query(
          `insert into app.shipment_packages(account_id, shipment_id, package_number, weight_kg, length_cm, width_cm, height_cm, tracking_code, metadata)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict(shipment_id, package_number)
           do update set weight_kg = excluded.weight_kg, length_cm = excluded.length_cm, width_cm = excluded.width_cm, height_cm = excluded.height_cm, tracking_code = excluded.tracking_code, metadata = excluded.metadata`,
          [ctx.accountId, shipment.id, p.package_number, p.weight_kg, p.length_cm || null, p.width_cm || null, p.height_cm || null, p.tracking_code || null, p.metadata || {}]
        );
      }

      await client.query(
        "update app.orders set status = 'DISPATCHED', updated_at = now() where account_id = $1 and id = $2",
        [ctx.accountId, body.orderId]
      );

      return shipment;
    });

    void pushTinyStatus({ accountId: ctx.accountId, orderId: body.orderId, status: 'DISPATCHED', trackingCode: result.tracking_code });
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'shipment', entityId: result.id, action: 'create_shipment', afterData: { ...body, idempotencyKey }, correlationId: ctx.correlationId });
    return { ...result, correlationId: ctx.correlationId };
  }));
}

// Atualização manual de rastreio (transportadoras sem integração por API).
const MANUAL_STATUSES = {
  IN_TRANSIT: 'Em trânsito',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  EXCEPTION: 'Ocorrência na entrega',
  RETURNED: 'Devolvido ao remetente',
  CANCELED: 'Envio cancelado'
};

export function registerManualTrackingRoutes(app) {
  app.post('/shipments/:id/events', requireAnyRole(['operador_logistico'], async ({ ctx, params, body }) => {
    const status = String(body.status || '').toUpperCase();
    if (!MANUAL_STATUSES[status]) throw new HttpError(400, 'Situação inválida.');
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new HttpError(400, 'Data inválida.');
    if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) throw new HttpError(400, 'A data não pode estar no futuro.');
    const description = String(body.description || '').trim() || MANUAL_STATUSES[status];
    const receiver = body.receiverName ? String(body.receiverName).trim() : null;

    const result = await transaction(async (client) => {
      const sh = await client.query('select * from app.shipments where account_id = $1 and id = $2', [ctx.accountId, params.id]);
      if (!sh.rows[0]) throw new Error('Shipment not found');
      const evt = await client.query(
        `insert into app.tracking_events(account_id, shipment_id, occurred_at, external_status, macro_status, raw_payload, external_event_id)
         values($1,$2,$3,$4,$5,$6,$7) returning *`,
        [ctx.accountId, params.id, occurredAt.toISOString(), status === 'DELIVERED' && receiver ? `${description} (recebedor: ${receiver})` : description, status,
          JSON.stringify({ manual: true, receiverName: receiver }), `manual-${crypto.randomUUID()}`]
      );
      await client.query(
        `update app.shipments set status = $3::app.shipment_status, updated_at = now(),
           delivered_at = case when $3 = 'DELIVERED' then $4::timestamptz else delivered_at end,
           delivered_to = case when $3 = 'DELIVERED' then coalesce($5, delivered_to) else delivered_to end,
           delivery_notes = case when $3 in ('DELIVERED','EXCEPTION','RETURNED') then coalesce($6, delivery_notes) else delivery_notes end
         where account_id = $1 and id = $2`,
        [ctx.accountId, params.id, status, occurredAt.toISOString(), receiver, body.notes ? String(body.notes) : null]
      );
      await client.query('update app.orders set status = $3::app.order_status, updated_at = now() where account_id = $1 and id = $2', [ctx.accountId, sh.rows[0].order_id, status]);
      return { ...evt.rows[0], orderId: sh.rows[0].order_id };
    });

    void pushTinyStatus({ accountId: ctx.accountId, orderId: result.orderId, status });
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'tracking_event', entityId: result.id, action: 'manual_tracking', afterData: { status, receiver }, correlationId: ctx.correlationId });
    return { ...result, correlationId: ctx.correlationId };
  }));
}

async function updateOrderStatusFromShipment({ accountId, orderId }) {
  if (!orderId) return;

  await query(
    "update app.orders set status = 'DISPATCHED', updated_at = now() where account_id = $1 and id = $2",
    [accountId, orderId]
  );
}

