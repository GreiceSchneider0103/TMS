import { query, transaction } from '../db.js';
import { getAccountId } from '../utils/context.js';
import { normalizeTrackingStatus } from '../../../../workers/src/trackingPolling.js';

export function registerTrackingRoutes(app) {
  app.post('/tracking/webhook/:provider', async ({ req, params, body }) => {
    const accountId = getAccountId(req);
    const eventKey = String(body.eventId || body.id || `${body.shipmentId}-${body.status}-${body.occurredAt}`);

    const log = await query(
      `insert into app.webhook_logs(account_id, provider, event_key, event_type, payload, status)
       values($1,$2,$3,$4,$5,'received')
       on conflict(account_id, provider, event_key)
       do update set payload = excluded.payload
       returning *`,
      [accountId, params.provider, eventKey, body.type || body.status || 'tracking', body]
    );

    const saved = await transaction(async (client) => {
      const shipmentQ = await client.query('select * from app.shipments where account_id = $1 and id = $2', [accountId, body.shipmentId]);
      if (!shipmentQ.rows[0]) throw new Error('Shipment not found');
      const macro = normalizeTrackingStatus(body.status);
      const evt = await client.query(
        `insert into app.tracking_events(account_id, shipment_id, occurred_at, external_status, macro_status, raw_payload, external_event_id)
         values($1,$2,$3,$4,$5,$6,$7)
         on conflict(account_id, shipment_id, external_event_id) do nothing
         returning *`,
        [accountId, body.shipmentId, body.occurredAt || new Date().toISOString(), body.status || 'unknown', macro, body, eventKey]
      );

      await client.query('update app.shipments set status = $1, updated_at = now(), delivered_at = case when $1 = \'DELIVERED\' then now() else delivered_at end where account_id = $2 and id = $3', [macro, accountId, body.shipmentId]);
      await client.query('update app.webhook_logs set status = $1, processed_at = now() where id = $2', ['processed', log.rows[0].id]);
      return evt.rows[0] || null;
    });

    return { processed: true, event: saved };
  });

  app.get('/tracking/shipment/:shipmentId', async ({ req, params }) => {
    const accountId = getAccountId(req);
    const { rows } = await query('select * from app.tracking_events where account_id = $1 and shipment_id = $2 order by occurred_at desc', [accountId, params.shipmentId]);
    return { items: rows };
  });
}
