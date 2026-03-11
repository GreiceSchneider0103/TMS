import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { logAudit } from '../services/audit.js';

export function registerShipmentRoutes(app) {
  app.get('/shipments', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query('select * from app.shipments where account_id = $1 order by created_at desc limit 100', [ctx.accountId]);
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/shipments/:id', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador'], async ({ ctx, params }) => {
    const shipment = await query('select * from app.shipments where account_id = $1 and id = $2', [ctx.accountId, params.id]);
    if (!shipment.rows[0]) throw new Error('Shipment not found');
    const packages = await query('select * from app.shipment_packages where account_id = $1 and shipment_id = $2 order by package_number', [ctx.accountId, params.id]);
    const tracking = await query('select * from app.tracking_events where account_id = $1 and shipment_id = $2 order by occurred_at desc', [ctx.accountId, params.id]);
    return { ...shipment.rows[0], packages: packages.rows, tracking: tracking.rows, correlationId: ctx.correlationId };
  }));

  app.post('/shipments', requireAnyRole(['operador_logistico'], async ({ ctx, body }) => {
    const idempotencyKey = String(body.idempotencyKey || crypto.createHash('sha256').update(`${body.orderId}-${body.quoteResultId}-${body.trackingCode || ''}`).digest('hex'));

    const existingByIdempotency = await query('select * from app.shipments where account_id = $1 and idempotency_key = $2 limit 1', [ctx.accountId, idempotencyKey]);
    if (existingByIdempotency.rows[0]) return { ...existingByIdempotency.rows[0], reused: true, correlationId: ctx.correlationId };

    const existingByOrderQuote = await query(`select * from app.shipments where account_id = $1 and order_id = $2 and quote_result_id = $3 limit 1`, [ctx.accountId, body.orderId, body.quoteResultId]);
    if (existingByOrderQuote.rows[0]) return { ...existingByOrderQuote.rows[0], reused: true, correlationId: ctx.correlationId };

    const result = await transaction(async (client) => {
      const quoteRes = await client.query('select * from app.quote_results where account_id = $1 and id = $2', [ctx.accountId, body.quoteResultId]);
      if (!quoteRes.rows[0]) throw new Error('Quote result not found');
      const q = quoteRes.rows[0];
      let shipment;
      try {
        const ins = await client.query(
          `insert into app.shipments(account_id, order_id, quote_result_id, carrier_id, carrier_service_id, tracking_code, invoice_number, cte_number, status, idempotency_key)
           values($1,$2,$3,$4,$5,$6,$7,$8,'DISPATCHED',$9)
           returning *`,
          [ctx.accountId, body.orderId, body.quoteResultId, q.carrier_id, body.carrierServiceId || null, body.trackingCode || null, body.invoiceNumber || null, body.cteNumber || null, idempotencyKey]
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
      return shipment;
    });

    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'shipment', entityId: result.id, action: 'create_shipment', afterData: { ...body, idempotencyKey }, correlationId: ctx.correlationId });
    return { ...result, correlationId: ctx.correlationId };
  }));
}
