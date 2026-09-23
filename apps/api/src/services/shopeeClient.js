import crypto from 'node:crypto';

const LIVE_HOST = 'https://partner.shopeemobile.com';
const TEST_HOST = 'https://partner.test-stable.shopeemobile.com';

class ShopeeApiError extends Error {
  constructor(message, { status = 502, details = null } = {}) {
    super(message);
    this.name = 'ShopeeApiError';
    this.status = status;
    this.details = details;
  }
}

export class ShopeeClient {
  constructor({ isSandbox = false } = {}) {
    this.partnerId = String((isSandbox ? process.env.SHOPEE_TEST_PARTNER_ID : process.env.SHOPEE_LIVE_PARTNER_ID) || '');
    this.partnerKey = String((isSandbox ? process.env.SHOPEE_TEST_PARTNER_KEY : process.env.SHOPEE_LIVE_PARTNER_KEY) || '');
    this.isSandbox = isSandbox;
    this.host = isSandbox ? TEST_HOST : LIVE_HOST;
    this.timeoutMs = Number(process.env.SHOPEE_TIMEOUT_MS || 15000);
  }

  assertConfigured() {
    if (!this.partnerId || !this.partnerKey) {
      throw new ShopeeApiError('Shopee client is not configured: set SHOPEE_PARTNER_ID and SHOPEE_PARTNER_KEY', { status: 500 });
    }
  }

  buildAuthUrl(redirectUrl) {
    this.assertConfigured();
    const path = '/api/v2/shop/auth_partner';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.signPublic(path, timestamp);
    const url = new URL(`${this.host}${path}`);
    url.searchParams.set('partner_id', this.partnerId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);
    url.searchParams.set('redirect', redirectUrl);
    return url.toString();
  }

  async exchangeCodeForTokens({ code, shopId }) {
    const path = '/api/v2/auth/token/get';
    return this.publicRequest(path, { code, shop_id: Number(shopId), partner_id: Number(this.partnerId) });
  }

  async refreshTokens({ refreshToken, shopId }) {
    const path = '/api/v2/auth/access_token/get';
    return this.publicRequest(path, { refresh_token: refreshToken, shop_id: Number(shopId), partner_id: Number(this.partnerId) });
  }

  async shopRequest(path, { method = 'GET', query = null, body = null, accessToken, shopId }) {
    this.assertConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.signShop(path, timestamp, accessToken, shopId);

    const url = new URL(`${this.host}${path}`);
    url.searchParams.set('partner_id', this.partnerId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('shop_id', String(shopId));
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    return this.send(url, method, body);
  }

  async publicRequest(path, body) {
    this.assertConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.signPublic(path, timestamp);
    const url = new URL(`${this.host}${path}`);
    url.searchParams.set('partner_id', this.partnerId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);
    return this.send(url, 'POST', body);
  }

  signPublic(path, timestamp) {
    const base = `${this.partnerId}${path}${timestamp}`;
    return crypto.createHmac('sha256', this.partnerKey).update(base).digest('hex');
  }

  signShop(path, timestamp, accessToken, shopId) {
    const base = `${this.partnerId}${path}${timestamp}${accessToken}${shopId}`;
    return crypto.createHmac('sha256', this.partnerKey).update(base).digest('hex');
  }

  async send(url, method, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const data = await parseResponseBody(response);
      if (!response.ok || data?.error) {
        throw new ShopeeApiError(`Shopee ${method} ${url.pathname} failed: ${data?.error || response.status} ${data?.message || ''}`.trim(), {
          status: response.ok ? 502 : response.status,
          details: data
        });
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new ShopeeApiError(`Shopee ${method} ${url.pathname} timed out after ${this.timeoutMs}ms`, { status: 504 });
      }
      if (error instanceof ShopeeApiError) throw error;
      throw new ShopeeApiError(`Shopee ${method} ${url.pathname} transport error: ${error.message}`, { status: 502, details: { cause: error.message } });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export { ShopeeApiError };
