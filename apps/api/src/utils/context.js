import crypto from 'node:crypto';
import { query } from '../db.js';

export async function resolveContext(req) {
  const correlationId = String(req.headers['x-correlation-id'] || crypto.randomUUID());
  const userId = String(req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000000');

  const apiKey = parseApiKey(req);
  if (apiKey) {
    const tokenHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const { rows } = await query(
      `select id, account_id, role from app.api_credentials where token_hash = $1 and is_active = true limit 1`,
      [tokenHash]
    );
    if (!rows[0]) throw new Error('Invalid API key');

    await query('update app.api_credentials set last_used_at = now() where id = $1', [rows[0].id]);
    return { accountId: rows[0].account_id, userId, role: rows[0].role, correlationId, authMode: 'api_key' };
  }

  if (process.env.INTERNAL_CONTEXT_TOKEN && req.headers['x-internal-token'] === process.env.INTERNAL_CONTEXT_TOKEN) {
    const accountId = req.headers['x-account-id'];
    if (!accountId) throw new Error('Missing x-account-id for internal context');
    return { accountId: String(accountId), userId, role: 'admin', correlationId, authMode: 'internal' };
  }

  throw new Error('Unauthorized context. Use x-api-key or Authorization Bearer token');
}

function parseApiKey(req) {
  const fromHeader = req.headers['x-api-key'];
  if (fromHeader) return String(fromHeader);
  const auth = req.headers.authorization;
  if (!auth) return null;
  const [kind, token] = String(auth).split(' ');
  if (kind?.toLowerCase() === 'bearer' && token) return token;
  return null;
}
