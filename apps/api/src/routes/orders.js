import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { TinyClient } from '../services/tinyClient.js';
import { requireAnyRole } from '../utils/context.js';
import { logAudit, logSyncJob } from '../services/audit.js';
import { parseIntWithBounds } from '../utils/validation.js';

const tiny = new TinyClient();

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
              sh.id as shipment_id, sh.tracking_code,
              sq.id as selected_quote_result_id, sq.total_amount as selected_quote_amount
       from app.orders o
       left join app.recipients r on r.id = o.recipient_id and r.account_id = $1
       left join lateral (
         select s.id, s.tracking_code, c.name as carrier_name from app.shipments s left join app.carriers c on c.id = s.carrier_id
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
      `select s.id, s.status, s.tracking_code, s.created_at, c.name as carrier_name
       from app.shipments s left join app.carriers c on c.id = s.carrier_id
       where s.account_id = $1 and s.order_id = $2 order by s.created_at desc`,
      [ctx.accountId, params.id]
    );
    return { ...rows[0], items: items.rows, shipments: shipments.rows, correlationId: ctx.correlationId };
  }));

  app.post('/orders/import/tiny', requireAnyRole(['operador_logistico', 'analista_integracao'], async ({ ctx, body }) => {
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
      payload = body.orders ? { orders: body.orders } : await tiny.listOrders({ page: body.page || 1, limit: body.limit || 50, correlationId: ctx.correlationId });
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
          `insert into app.orders(account_id, external_id, order_number, channel, total_amount, invoice_amount, status, raw_payload)
           values($1,$2,$3,$4,$5,$6,'READY_FOR_QUOTE',$7)
           on conflict (account_id, external_id)
           do update set order_number = excluded.order_number, channel = excluded.channel, total_amount = excluded.total_amount,
             invoice_amount = excluded.invoice_amount, raw_payload = excluded.raw_payload, updated_at = now()
           returning *`,
          [ctx.accountId, externalId, String(o.number || o.numero || externalId), String(o.channel || o.canal || 'tiny'), totalAmount, invoiceAmount, o.raw || o]
        );
        imported.push(upsert.rows[0]);
      }
    });

    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'order', entityId: imported[0]?.id || 'batch', action: 'tiny_import', afterData: { count: imported.length }, correlationId: ctx.correlationId });
    return { importedCount: imported.length, imported, correlationId: ctx.correlationId };
  }));
}
