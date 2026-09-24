import { query, runWithDbContext } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { HttpError } from '../utils/router.js';
import { logAudit } from '../services/audit.js';
import { encryptSecret } from '../services/cte/secretBox.js';
import { buildAuthUrl } from '../services/tiny/tinyV3Client.js';
import {
  DEFAULT_TINY_SETTINGS, connectionSettings, loadTinyConnection, createOAuthState, completeOAuth,
  syncTinyOrders, syncTinyProducts, getTinyClient, importTinyOrder
} from '../services/tiny/tinySync.js';

const API_PUBLIC_URL = String(process.env.API_PUBLIC_URL || process.env.SHOPEE_REDIRECT_BASE_URL || 'https://tms-api-pchl.onrender.com').replace(/\/$/, '');
export const TINY_REDIRECT_URI = `${API_PUBLIC_URL}/webhooks/tiny/oauth-callback`;

const BOOL_SETTINGS = ['importOrders', 'importProducts', 'syncMeasures', 'importInvoices', 'updateStatus', 'autoSync'];

function publicView(conn) {
  return {
    configured: Boolean(conn?.client_id && conn?.client_secret_encrypted),
    connected: Boolean(conn?.access_token_encrypted) && conn?.status === 'conectado',
    status: conn?.status || 'pendente',
    clientId: conn?.client_id || '',
    hasSecret: Boolean(conn?.client_secret_encrypted),
    lastError: conn?.last_error || null,
    connectedAt: conn?.connected_at || null,
    lastOrderSyncAt: conn?.last_order_sync_at || null,
    lastProductSyncAt: conn?.last_product_sync_at || null,
    redirectUri: TINY_REDIRECT_URI,
    webhookUrl: conn?.webhook_token ? `${API_PUBLIC_URL}/webhooks/tiny/${conn.webhook_token}` : null,
    settings: connectionSettings(conn)
  };
}

function cleanSettings(input = {}, current = {}) {
  const out = { ...DEFAULT_TINY_SETTINGS, ...current };
  for (const k of BOOL_SETTINGS) if (k in input) out[k] = Boolean(input[k]);
  if ('daysBack' in input) out.daysBack = Math.min(90, Math.max(1, Number(input.daysBack) || 15));
  if ('importSituacoes' in input) {
    const list = (Array.isArray(input.importSituacoes) ? input.importSituacoes : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 9);
    if (!list.length) throw new HttpError(400, 'Escolha pelo menos uma situação de pedido para importar.');
    out.importSituacoes = [...new Set(list)];
  }
  if ('companyId' in input) out.companyId = input.companyId ? String(input.companyId) : null;
  return out;
}

export function registerTinyIntegrationRoutes(app) {
  app.get('/integrations/tiny', requireAnyRole(['admin', 'operador_logistico', 'analista_integracao', 'visualizador'], async ({ ctx }) => {
    return { ...publicView(await loadTinyConnection(ctx.accountId)), correlationId: ctx.correlationId };
  }));

  // Salva Client ID / Client Secret do aplicativo criado no Tiny e as opções da integração.
  app.patch('/integrations/tiny', requireAnyRole(['admin'], async ({ ctx, body }) => {
    const current = await loadTinyConnection(ctx.accountId);
    const clientId = body.clientId !== undefined ? String(body.clientId || '').trim() : current?.client_id || '';
    const secret = body.clientSecret ? String(body.clientSecret).trim() : null;
    const settings = cleanSettings(body.settings || {}, current?.settings || {});
    if (settings.companyId) {
      const c = await query('select 1 from app.companies where account_id = $1 and id = $2', [ctx.accountId, settings.companyId]);
      if (!c.rows[0]) throw new HttpError(400, 'Empresa não encontrada.');
    }
    const credentialsChanged = (clientId && clientId !== current?.client_id) || Boolean(secret);
    await query(
      `insert into app.erp_connections(account_id, provider, client_id, client_secret_encrypted, settings)
       values($1, 'tiny', $2, $3, $4)
       on conflict (account_id, provider) do update set
         client_id = excluded.client_id,
         client_secret_encrypted = coalesce(excluded.client_secret_encrypted, app.erp_connections.client_secret_encrypted),
         settings = excluded.settings,
         -- Trocar o aplicativo invalida a autorização anterior.
         access_token_encrypted = case when $5 then null else app.erp_connections.access_token_encrypted end,
         refresh_token_encrypted = case when $5 then null else app.erp_connections.refresh_token_encrypted end,
         status = case when $5 then 'pendente' else app.erp_connections.status end,
         updated_at = now()`,
      [ctx.accountId, clientId || null, secret ? encryptSecret(secret) : null, JSON.stringify(settings), Boolean(current && credentialsChanged)]
    );
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'erp_connection', entityId: 'tiny', action: 'update', afterData: { clientId, secretChanged: Boolean(secret), settings }, correlationId: ctx.correlationId });
    return { ...publicView(await loadTinyConnection(ctx.accountId)), correlationId: ctx.correlationId };
  }));

  app.get('/integrations/tiny/auth-url', requireAnyRole(['admin'], async ({ ctx }) => {
    const conn = await loadTinyConnection(ctx.accountId);
    if (!conn?.client_id || !conn?.client_secret_encrypted) throw new HttpError(400, 'Informe e salve o Client ID e o Client Secret do aplicativo do Tiny antes de autorizar.');
    const state = await createOAuthState(ctx.accountId);
    return { url: buildAuthUrl({ clientId: conn.client_id, redirectUri: TINY_REDIRECT_URI, state }), redirectUri: TINY_REDIRECT_URI, correlationId: ctx.correlationId };
  }));

  // Retorno do login no Tiny (URL de redirecionamento cadastrada no aplicativo).
  app.get('/webhooks/tiny/oauth-callback', async ({ res, query: q }) => {
    const state = String(q.state || '');
    const code = String(q.code || '');
    if (q.error) return writeHtml(res, 400, `<h1>Autorização cancelada</h1><p>${escapeHtml(q.error_description || q.error)}</p>`);
    if (!state || !code) return writeHtml(res, 400, '<h1>Falha na autorização</h1><p>O Tiny não devolveu o código de autorização.</p>');
    try {
      const accountId = await completeOAuth({ state, code, redirectUri: TINY_REDIRECT_URI });
      await logAudit({ accountId, userId: '00000000-0000-0000-0000-000000000000', entity: 'erp_connection', entityId: 'tiny', action: 'oauth_connected' }).catch(() => null);
      return writeHtml(res, 200, '<h1>Tiny conectado com sucesso</h1><p>Pode fechar esta janela e voltar para o TMS.</p><script>try{window.opener&&window.opener.postMessage("tiny-connected","*")}catch(e){}</script>');
    } catch (error) {
      return writeHtml(res, error.status === 400 ? 400 : 502, `<h1>Falha ao conectar com o Tiny</h1><p>${escapeHtml(error.message || 'erro inesperado')}</p>`);
    }
  });

  app.delete('/integrations/tiny', requireAnyRole(['admin'], async ({ ctx }) => {
    await query(
      `update app.erp_connections set access_token_encrypted = null, refresh_token_encrypted = null, access_token_expires_at = null,
         status = 'desconectado', oauth_state = null, updated_at = now() where account_id = $1 and provider = 'tiny'`,
      [ctx.accountId]
    );
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'erp_connection', entityId: 'tiny', action: 'disconnect', correlationId: ctx.correlationId });
    return { ...publicView(await loadTinyConnection(ctx.accountId)), correlationId: ctx.correlationId };
  }));

  // Sincronização manual: pedidos (padrão) ou catálogo de produtos.
  app.post('/integrations/tiny/sync', requireAnyRole(['admin', 'operador_logistico', 'analista_integracao'], async ({ ctx, body }) => {
    const kind = body.kind === 'products' ? 'products' : 'orders';
    const result = kind === 'products'
      ? await syncTinyProducts({ accountId: ctx.accountId, correlationId: ctx.correlationId })
      : await syncTinyOrders({ accountId: ctx.accountId, correlationId: ctx.correlationId, daysBack: body.daysBack });
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'tiny_sync', entityId: kind, action: 'sync', afterData: { ...result, errors: result.errors.length }, correlationId: ctx.correlationId });
    return { kind, ...result, correlationId: ctx.correlationId };
  }));

  // Notificações do Tiny (webhook configurado no Tiny com a URL exibida no TMS).
  app.post('/webhooks/tiny/:token', async ({ params, body, res }) => {
    const { rows } = await query("select account_id from app.erp_connections where provider = 'tiny' and webhook_token = $1", [String(params.token || '')]);
    if (!rows[0]) throw new HttpError(404, 'Webhook não encontrado');
    const accountId = rows[0].account_id;
    const ctx = { accountId, role: 'admin', correlationId: `tiny-webhook-${Date.now()}`, userId: '00000000-0000-0000-0000-000000000000' };
    const tipo = String(body?.tipo || body?.type || '').toLowerCase();
    const dados = body?.dados || body?.data || {};
    const id = dados.idPedido || dados.id || body?.idPedido || null;

    let outcome = { received: true, processed: false };
    await runWithDbContext(ctx, async () => {
      try {
        const { client, settings } = await getTinyClient(accountId);
        if (/produto|estoque|preco/.test(tipo)) {
          outcome = { received: true, processed: false, ignored: 'produto' }; // produtos entram pela sincronização/pedidos
        } else if (id && settings.importOrders) {
          const r = await importTinyOrder({ accountId, client, settings, tinyOrderId: String(id), respectSituacoes: true });
          outcome = { received: true, processed: !r.skipped, orderId: r.orderId || null };
        }
      } catch (error) {
        outcome = { received: true, processed: false, error: error.message };
      }
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(outcome));
  });
}

function writeHtml(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>TMS Lessul - Tiny</title></head><body style="font-family:sans-serif;text-align:center;margin-top:80px;">${body}</body></html>`);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
