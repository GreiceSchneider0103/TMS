import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { TinyClient } from '../services/tinyClient.js';
import { requireAnyRole } from '../utils/context.js';
import { logAudit, logSyncJob } from '../services/audit.js';

const tiny = new TinyClient();

export function registerOrderRoutes(app) {
  app.get('/orders', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador', 'analista_integracao'], async ({ ctx, query: qs }) => {
    const limit = Number(qs.limit || 50);
    const offset = Number(qs.offset || 0);
    const { rows } = await query(
      `select * from app.orders where account_id = $1 order by created_at desc limit $2 offset $3`,
      [ctx.accountId, limit, offset]
    );
    return { items: rows, total: rows.length, correlationId: ctx.correlationId };
  }));

  app.get('/orders/:id', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador', 'analista_integracao'], async ({ ctx, params }) => {
    const { rows } = await query(`select * from app.orders where account_id = $1 and id = $2`, [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Order not found');
    const items = await query(`select * from app.order_items where account_id = $1 and order_id = $2`, [ctx.accountId, params.id]);
    return { ...rows[0], items: items.rows, correlationId: ctx.correlationId };
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
