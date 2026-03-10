import { query } from '../db.js';

export async function logAudit({ accountId, userId, entity, entityId, action, beforeData = null, afterData = null, context = {}, correlationId = null }) {
  await query(
    `insert into app.audit_logs(account_id, actor_user_id, entity, entity_id, action, before_data, after_data, context, correlation_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [accountId, userId, entity, String(entityId), action, beforeData, afterData, context, correlationId]
  );
}

export async function logSyncJob({ accountId, kind, status, payload = {}, response = null, error = null, attempts = 0, externalRef = null, idempotencyKey = null, correlationId = null }) {
  const { rows } = await query(
    `insert into app.sync_jobs(account_id, kind, status, payload, response, error, attempts, external_ref, idempotency_key, correlation_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (account_id, kind, idempotency_key) where idempotency_key is not null
     do update set status = excluded.status, payload = excluded.payload, response = excluded.response, error = excluded.error,
                   attempts = greatest(app.sync_jobs.attempts, excluded.attempts), updated_at = now(), correlation_id = excluded.correlation_id
     returning *`,
    [accountId, kind, status, payload, response, error, attempts, externalRef, idempotencyKey, correlationId]
  );
  return rows[0];
}
