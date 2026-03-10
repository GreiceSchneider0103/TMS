import crypto from 'node:crypto';
import { query, setDbContext } from '../db.js';

export async function resolveContext(req) {
  if (req.tmsContext) {
    setDbContext(req.tmsContext);
    return req.tmsContext;
  }

  const correlationId = String(req.headers['x-correlation-id'] || crypto.randomUUID());
  const userId = String(req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000000');

  const apiKey = parseApiKey(req);
  if (apiKey) {
    const authResult = await query('select * from app.authenticate_api_key($1)', [apiKey]);
    if (!authResult.rows[0]) throw new Error('Invalid API key');

    await query('select app.touch_api_credential($1)', [authResult.rows[0].credential_id]);

    const ctx = {
      accountId: authResult.rows[0].account_id,
      userId,
      role: authResult.rows[0].role,
      correlationId,
      authMode: 'api_key'
    };
    req.tmsContext = ctx;
    setDbContext(ctx);
    return ctx;
  }

  if (process.env.INTERNAL_CONTEXT_TOKEN && req.headers['x-internal-token'] === process.env.INTERNAL_CONTEXT_TOKEN) {
    const accountId = req.headers['x-account-id'];
    if (!accountId) throw new Error('Missing x-account-id for internal context');

    const ctx = {
      accountId: String(accountId),
      userId,
      role: 'admin',
      correlationId,
      authMode: 'internal'
    };
    req.tmsContext = ctx;
    setDbContext(ctx);
    return ctx;
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
