import { HttpError } from '../../utils/router.js';

// Cliente da API v3 do Tiny (Olist ERP): OAuth2 (Keycloak) + chamadas REST com Bearer.
export const TINY_AUTH_BASE = process.env.TINY_AUTH_BASE_URL || 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect';
export const TINY_API_BASE = process.env.TINY_V3_BASE_URL || 'https://api.tiny.com.br/public-api/v3';
const TIMEOUT_MS = Number(process.env.TINY_TIMEOUT_MS || 20000);
const MAX_RETRIES = 3;

export class TinyV3Error extends Error {
  constructor(message, { status = 502, tinyStatus = null, details = null } = {}) {
    super(message);
    this.name = 'TinyV3Error';
    this.status = status;
    this.tinyStatus = tinyStatus;
    this.details = details;
  }
}

export function buildAuthUrl({ clientId, redirectUri, state }) {
  const url = new URL(`${TINY_AUTH_BASE}/auth`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

// grant: { code, redirectUri } (authorization_code) ou { refreshToken } (refresh_token)
export async function requestToken({ clientId, clientSecret, code = null, redirectUri = null, refreshToken = null }, fetchImpl = fetch) {
  const form = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  if (refreshToken) {
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', refreshToken);
  } else {
    form.set('grant_type', 'authorization_code');
    form.set('code', code);
    form.set('redirect_uri', redirectUri);
  }
  const res = await withTimeout((signal) => fetchImpl(`${TINY_AUTH_BASE}/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal
  }));
  const data = await parseBody(res);
  if (!res.ok || !data?.access_token) {
    const msg = data?.error_description || data?.error || `HTTP ${res.status}`;
    throw new TinyV3Error(`Tiny recusou a autorização: ${msg}`, { status: res.status === 400 || res.status === 401 ? 401 : 502, tinyStatus: res.status, details: data });
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + Number(data.expires_in || 14400) * 1000),
    refreshExpiresAt: data.refresh_expires_in ? new Date(Date.now() + Number(data.refresh_expires_in) * 1000) : null
  };
}

export class TinyV3Client {
  // getToken: função async que devolve um access token válido (renova quando preciso).
  constructor({ getToken, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    this.getToken = getToken;
    this.fetch = fetchImpl;
    this.sleep = sleep;
  }

  async request(method, path, { query = null, body = null } = {}) {
    const url = new URL(`${TINY_API_BASE}${path}`);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt += 1) {
      const token = await this.getToken({ forceRefresh: attempt > 0 && this.lastStatus === 401 });
      const res = await withTimeout((signal) => this.fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal
      }));
      this.lastStatus = res.status;
      const data = await parseBody(res);
      if (res.ok) return data;

      // 401: token expirado -> renova uma vez. 429/5xx: espera e tenta de novo.
      const retryable = (res.status === 401 && attempt === 0) || res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers?.get?.('retry-after')) || 0;
        if (res.status !== 401) await this.sleep(retryAfter ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      throw new TinyV3Error(`Tiny ${method} ${path}: ${describeError(res.status, data)}`, {
        status: res.status === 404 ? 404 : res.status === 401 || res.status === 403 ? 401 : 502,
        tinyStatus: res.status,
        details: data
      });
    }
  }

  listOrders(params = {}) { return this.request('GET', '/pedidos', { query: params }); }
  getOrder(id) { return this.request('GET', `/pedidos/${encodeURIComponent(id)}`); }
  updateOrderStatus(id, situacao) { return this.request('PUT', `/pedidos/${encodeURIComponent(id)}/situacao`, { body: { situacao } }); }
  updateOrderDispatch(id, payload) { return this.request('PUT', `/pedidos/${encodeURIComponent(id)}/despacho`, { body: payload }); }
  listProducts(params = {}) { return this.request('GET', '/produtos', { query: params }); }
  getProduct(id) { return this.request('GET', `/produtos/${encodeURIComponent(id)}`); }
  getInvoiceXml(id) { return this.request('GET', `/notas/${encodeURIComponent(id)}/xml`); }
  getAccountInfo() { return this.request('GET', '/info'); }

  // Percorre todas as páginas de uma listagem (limit/offset) até maxItems.
  async listAll(fn, params = {}, { pageSize = 100, maxItems = 2000 } = {}) {
    const out = [];
    for (let offset = 0; out.length < maxItems; offset += pageSize) {
      const page = await fn.call(this, { ...params, limit: pageSize, offset });
      const items = Array.isArray(page?.itens) ? page.itens : [];
      out.push(...items);
      const total = Number(page?.paginacao?.total ?? NaN);
      if (items.length < pageSize || (Number.isFinite(total) && offset + items.length >= total)) break;
    }
    return out.slice(0, maxItems);
  }
}

async function withTimeout(run) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error?.name === 'AbortError') throw new TinyV3Error('Tempo esgotado ao falar com o Tiny.', { status: 504 });
    if (error instanceof TinyV3Error || error instanceof HttpError) throw error;
    throw new TinyV3Error(`Não foi possível conectar ao Tiny: ${error?.message || 'erro de rede'}`, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function describeError(status, data) {
  const msg = data?.mensagem || data?.message || data?.error_description || data?.error || '';
  const details = Array.isArray(data?.detalhes) ? data.detalhes.map((d) => d?.mensagem || d?.message || '').filter(Boolean).join('; ') : '';
  return [`HTTP ${status}`, msg, details].filter(Boolean).join(' - ');
}
