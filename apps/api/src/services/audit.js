import { query } from '../db.js';

export async function logAudit({ accountId, userId, entity, entityId, action, beforeData = null, afterData = null, context = {} }) {
  await query(
    `insert into app.audit_logs(account_id, actor_user_id, entity, entity_id, action, before_data, after_data, context)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [accountId, userId, entity, String(entityId), action, beforeData, afterData, context]
  );
}

export async function logSyncJob({ accountId, kind, status, payload = {}, response = null, error = null, attempts = 0, externalRef = null }) {
  const { rows } = await query(
    `insert into app.sync_jobs(account_id, kind, status, payload, response, error, attempts, external_ref)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [accountId, kind, status, payload, response, error, attempts, externalRef]
  );
  return rows[0];
}
