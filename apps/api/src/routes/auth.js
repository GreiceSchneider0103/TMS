import { query } from '../db.js';
import { HttpError } from '../utils/router.js';

export function registerAuthRoutes(app) {
  app.post('/auth/session', async ({ body }) => {
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey) throw new HttpError(400, 'apiKey is required');

    const authResult = await query('select * from app.authenticate_api_key($1)', [apiKey]);
    if (!authResult.rows[0]) throw new HttpError(401, 'Invalid API key');

    await query('select app.touch_api_credential($1)', [authResult.rows[0].credential_id]);
    return {
      ok: true,
      accountId: authResult.rows[0].account_id,
      role: authResult.rows[0].role
    };
  });

  app.post('/auth/logout', async () => ({ ok: true }));
}
