import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { ShopeeClient } from '../services/shopeeClient.js';
import { getActiveShopeeShops, syncShopOrders, dispatchShopeeOrder } from '../services/shopeeSync.js';
import { logAudit } from '../services/audit.js';

const REDIRECT_BASE_URL = process.env.SHOPEE_REDIRECT_BASE_URL || 'https://tms-api-pchl.onrender.com';
const IS_SANDBOX = String(process.env.SHOPEE_IS_SANDBOX || 'true') === 'true';

export function registerShopeeIntegrationRoutes(app) {
  app.get('/integrations/shopee/auth-url', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx }) => {
    const client = new ShopeeClient({ isSandbox: IS_SANDBOX });
    const redirectUrl = `${REDIRECT_BASE_URL}/webhooks/shopee/oauth-callback?accountId=${ctx.accountId}&sandbox=${IS_SANDBOX}`;
    const url = client.buildAuthUrl(redirectUrl);
    return { url, correlationId: ctx.correlationId };
  }));

  app.get('/webhooks/shopee/oauth-callback', async ({ req, res, query: queryParams }) => {
    const accountId = String(queryParams.accountId || '');
    const isSandbox = String(queryParams.sandbox || 'false') === 'true';
    const code = String(queryParams.code || '');
    const shopId = String(queryParams.shop_id || '');

    if (!accountId || !code || !shopId) {
      writeHtml(res, 400, '<h1>Falha na autorização</h1><p>Parâmetros ausentes (accountId, code ou shop_id).</p>');
      return;
    }

    try {
      const client = new ShopeeClient({ isSandbox });
      const tokens = await client.exchangeCodeForTokens({ code, shopId });
      const expiresAt = new Date(Date.now() + Number(tokens.expire_in || 0) * 1000);

      await query(
        `insert into app.shopee_shops(account_id, shop_id, partner_id, access_token, refresh_token, token_expires_at, is_sandbox)
         values($1,$2,$3,$4,$5,$6,$7)
         on conflict (account_id, shop_id) do update set
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           token_expires_at = excluded.token_expires_at,
           is_active = true,
           updated_at = now()`,
        [accountId, shopId, String((isSandbox ? process.env.SHOPEE_TEST_PARTNER_ID : process.env.SHOPEE_LIVE_PARTNER_ID) || ''), tokens.access_token, tokens.refresh_token, expiresAt.toISOString(), isSandbox]
      );

      writeHtml(res, 200, '<h1>Loja Shopee conectada com sucesso</h1><p>Pode fechar esta janela e voltar para o TMS.</p>');
    } catch (error) {
      writeHtml(res, 502, `<h1>Falha ao conectar com a Shopee</h1><p>${escapeHtml(error?.message || 'erro inesperado')}</p>`);
    }
  });

  app.get('/integrations/shopee/shops', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query(
      `select id, shop_id, shop_name, is_sandbox, is_active, last_synced_at, created_at
       from app.shopee_shops where account_id = $1 order by created_at desc`,
      [ctx.accountId]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.post('/integrations/shopee/sync', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx }) => {
    const shops = await getActiveShopeeShops(ctx.accountId);
    if (!shops.length) return { synced: 0, quoted: 0, shops: 0, correlationId: ctx.correlationId };

    let synced = 0;
    let quoted = 0;
    for (const shop of shops) {
      const result = await syncShopOrders({ accountId: ctx.accountId, shop, correlationId: ctx.correlationId });
      synced += result.synced;
      quoted += result.quoted;
    }

    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'shopee_sync', entityId: ctx.accountId, action: 'sync', afterData: { synced, quoted, shops: shops.length }, correlationId: ctx.correlationId });
    return { synced, quoted, shops: shops.length, correlationId: ctx.correlationId };
  }));

  app.post('/integrations/shopee/orders/:orderId/dispatch', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, params }) => {
    const result = await dispatchShopeeOrder({ accountId: ctx.accountId, orderId: params.orderId, correlationId: ctx.correlationId });
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'shipment', entityId: result.shipment.id, action: 'shopee_dispatch', afterData: { trackingCode: result.trackingCode }, correlationId: ctx.correlationId });
    return { ...result, correlationId: ctx.correlationId };
  }));
}

function writeHtml(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body style="font-family:sans-serif;text-align:center;margin-top:80px;">${body}</body></html>`);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
