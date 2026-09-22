import crypto from 'node:crypto';
import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { logAudit } from '../services/audit.js';

export function registerApiCredentialRoutes(app) {
  app.get('/api-credentials', requireAnyRole(['admin'], async ({ ctx }) => {
    const { rows } = await query(
      'select id, label, role, is_active, last_used_at, created_at from app.api_credentials where account_id = $1 order by created_at desc',
      [ctx.accountId]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.post('/api-credentials', requireAnyRole(['admin'], async ({ ctx, body }) => {
    const label = String(body.label || '').trim();
    if (!label) throw new Error('label is required');
    const role = String(body.role || 'integracao').trim();

    const rawToken = `tms_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const { rows } = await query(
      `insert into app.api_credentials(account_id, label, token_hash, role) values($1,$2,$3,$4)
       returning id, label, role, is_active, last_used_at, created_at`,
      [ctx.accountId, label, tokenHash, role]
    );
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'api_credential', entityId: rows[0].id, action: 'create', afterData: { label, role }, correlationId: ctx.correlationId });
    return { ...rows[0], token: rawToken, correlationId: ctx.correlationId };
  }));

  app.patch('/api-credentials/:id/revoke', requireAnyRole(['admin'], async ({ ctx, params }) => {
    const { rows } = await query(
      `update app.api_credentials set is_active = false where account_id = $1 and id = $2
       returning id, label, role, is_active, last_used_at, created_at`,
      [ctx.accountId, params.id]
    );
    if (!rows[0]) throw new Error('API credential not found');
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'api_credential', entityId: params.id, action: 'revoke', correlationId: ctx.correlationId });
    return { ...rows[0], correlationId: ctx.correlationId };
  }));
}
