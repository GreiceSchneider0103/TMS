import { query, transaction } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { normalizeTrackingStatus } from '../../../../workers/src/trackingPolling.js';
import { logAudit } from '../services/audit.js';

export function registerTrackingRoutes(app) {
  app.post('/tracking/webhook/:provider', requireAnyRole(['operador_logistico', 'analista_integracao'], async ({ ctx, params, body }) => {
    const eventKey = String(body.eventId || body.id || `${body.shipmentId}-${body.status}-${body.occurredAt}`);

    const log = await query(
      `insert into app.webhook_logs(account_id, provider, event_key, event_type, payload, status, correlation_id)
       values($1,$2,$3,$4,$5,'received',$6)
       on conflict(account_id, provider, event_key)
       do update set payload = excluded.payload, correlation_id = excluded.correlation_id
       returning *`,
      [ctx.accountId, params.provider, eventKey, body.type || body.status || 'tracking', body, ctx.correlationId]
    );

    const saved = await transaction(async (client) => {
      const shipmentQ = await client.query('select * from app.shipments where account_id = $1 and id = $2', [ctx.accountId, body.shipmentId]);
      if (!shipmentQ.rows[0]) throw new Error('Shipment not found');
      const macro = normalizeTrackingStatus(body.status);
      const evt = await client.query(
        `insert into app.tracking_events(account_id, shipment_id, occurred_at, external_status, macro_status, raw_payload, external_event_id)
         values($1,$2,$3,$4,$5,$6,$7)
         on conflict(account_id, shipment_id, external_event_id) do nothing
         returning *`,
        [ctx.accountId, body.shipmentId, body.occurredAt || new Date().toISOString(), body.status || 'unknown', macro, body, eventKey]
      );

      if (evt.rows[0]) {
        await client.query("update app.shipments set status = $1, updated_at = now(), delivered_at = case when $1 = 'DELIVERED' then now() else delivered_at end where account_id = $2 and id = $3", [macro, ctx.accountId, body.shipmentId]);
        await client.query(
          `insert into app.sync_jobs(account_id, kind, status, payload, attempts, external_ref, idempotency_key, correlation_id)
           values($1,'tiny_status_sync','pending',$2,0,$3,$4,$5)
           on conflict(account_id, kind, idempotency_key) do nothing`,
          [ctx.accountId, { shipmentId: body.shipmentId, status: macro, trackingCode: shipmentQ.rows[0].tracking_code }, shipmentQ.rows[0].order_id, `tiny-sync-${body.shipmentId}-${macro}-${eventKey}`, ctx.correlationId]
        );
      }

      await client.query('update app.webhook_logs set status = $1, processed_at = now() where id = $2', ['processed', log.rows[0].id]);
      return evt.rows[0] || null;
    });

    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'tracking_event', entityId: saved?.id || eventKey, action: 'tracking_webhook', afterData: { provider: params.provider, shipmentId: body.shipmentId, status: body.status }, correlationId: ctx.correlationId });
    return { processed: true, deduped: !saved, event: saved, correlationId: ctx.correlationId };
  }));

  app.get('/tracking/shipment/:shipmentId', requireAnyRole(['operador_logistico', 'financeiro', 'visualizador', 'analista_integracao'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.tracking_events where account_id = $1 and shipment_id = $2 order by occurred_at desc', [ctx.accountId, params.shipmentId]);
    return { items: rows, correlationId: ctx.correlationId };
  }));
}
