import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { TinyClient } from '../services/tinyClient.js';
import { getAccountId, getUserId } from '../utils/context.js';
import { logAudit, logSyncJob } from '../services/audit.js';

const tiny = new TinyClient();

export function registerOrderRoutes(app) {
  app.get('/orders', async ({ req, query: qs }) => {
    const accountId = getAccountId(req);
    const limit = Number(qs.limit || 50);
    const offset = Number(qs.offset || 0);
    const { rows } = await query(
      `select * from app.orders where account_id = $1 order by created_at desc limit $2 offset $3`,
      [accountId, limit, offset]
    );
    return { items: rows, total: rows.length };
  });

  app.get('/orders/:id', async ({ req, params }) => {
    const accountId = getAccountId(req);
    const { rows } = await query(`select * from app.orders where account_id = $1 and id = $2`, [accountId, params.id]);
    if (!rows[0]) throw new Error('Order not found');
    const items = await query(`select * from app.order_items where account_id = $1 and order_id = $2`, [accountId, params.id]);
    return { ...rows[0], items: items.rows };
  });

  app.post('/orders/import/tiny', async ({ req, body }) => {
    const accountId = getAccountId(req);
    const userId = getUserId(req);
    let payload;
    try {
      payload = body.orders ? { orders: body.orders } : await tiny.listOrders({ page: body.page || 1, limit: body.limit || 50 });
      await logSyncJob({ accountId, kind: 'tiny_import_orders', status: 'success', payload: body, response: payload });
    } catch (error) {
      await logSyncJob({ accountId, kind: 'tiny_import_orders', status: 'error', payload: body, error: error.message, attempts: 1 });
      throw error;
    }

    const orders = payload.orders || payload.data || [];
    const imported = [];

    await transaction(async (client) => {
      for (const o of orders) {
        const externalId = String(o.id || o.external_id || o.numero || crypto.randomUUID());
        const upsert = await client.query(
          `insert into app.orders(account_id, external_id, order_number, channel, total_amount, invoice_amount, status, raw_payload)
           values($1,$2,$3,$4,$5,$6,'READY_FOR_QUOTE',$7)
           on conflict (account_id, external_id)
           do update set order_number = excluded.order_number, channel = excluded.channel, total_amount = excluded.total_amount,
             invoice_amount = excluded.invoice_amount, raw_payload = excluded.raw_payload, updated_at = now()
           returning *`,
          [accountId, externalId, String(o.number || o.numero || externalId), String(o.channel || o.canal || 'tiny'), Number(o.total || o.total_amount || 0), Number(o.invoice_amount || o.total || 0), o]
        );
        imported.push(upsert.rows[0]);
      }
    });

    await logAudit({ accountId, userId, entity: 'order', entityId: imported[0]?.id || 'batch', action: 'tiny_import', afterData: { count: imported.length } });
    return { importedCount: imported.length, imported };
  });
}
