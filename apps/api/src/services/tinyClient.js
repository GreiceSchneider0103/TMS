class TinyClientError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'TinyClientError';
    this.meta = meta;
  }
}

export class TinyClient {
  constructor() {
    this.baseUrl = process.env.TINY_BASE_URL;
    this.token = process.env.TINY_API_TOKEN;
    this.timeoutMs = Number(process.env.TINY_TIMEOUT_MS || 15000);
    this.ordersPath = process.env.TINY_ORDERS_PATH || '/orders';
    this.statusPathTemplate = process.env.TINY_ORDER_STATUS_PATH_TEMPLATE || '/orders/{externalOrderId}/status';
  }

  assertConfigured() {
    if (!this.baseUrl || !this.token) {
      throw new TinyClientError('Tiny client is not configured: set TINY_BASE_URL and TINY_API_TOKEN');
    }
  }

  async listOrders({ page = 1, limit = 50, correlationId = null } = {}) {
    this.assertConfigured();
    const url = new URL(this.ordersPath, this.baseUrl);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    return this.#requestJson(url, { method: 'GET', correlationId });
  }

  async updateOrderStatus({ externalOrderId, payload, correlationId = null }) {
    this.assertConfigured();
    const path = this.statusPathTemplate.replace('{externalOrderId}', encodeURIComponent(String(externalOrderId)));
    const url = new URL(path, this.baseUrl);
    return this.#requestJson(url, { method: 'POST', body: payload, correlationId });
  }

  async #requestJson(url, { method, body = null, correlationId = null }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });

      const data = await readJsonSafe(response);
      if (!response.ok) {
        throw new TinyClientError(`Tiny request failed: ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          url: String(url),
          responseBody: data
        });
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new TinyClientError('Tiny request timeout', { timeoutMs: this.timeoutMs, url: String(url) });
      }
      if (error instanceof TinyClientError) throw error;
      throw new TinyClientError('Tiny request error', { url: String(url), cause: error?.message || String(error) });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
