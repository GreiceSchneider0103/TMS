class TinyApiError extends Error {
  constructor(message, { status = 502, provider = 'tiny', details = null } = {}) {
    super(message);
    this.name = 'TinyApiError';
    this.status = status;
    this.provider = provider;
    this.details = details;
  }
}

export class TinyClient {
  constructor() {
    this.baseUrl = process.env.TINY_BASE_URL;
    this.token = process.env.TINY_API_TOKEN;
    this.timeoutMs = Number(process.env.TINY_TIMEOUT_MS || 15000);
  }

  assertConfigured() {
    if (!this.baseUrl || !this.token) {
      throw new TinyApiError('Tiny client is not configured: set TINY_BASE_URL and TINY_API_TOKEN', { status: 500 });
    }
  }

  async listOrders({ page = 1, limit = 50, correlationId = null } = {}) {
    const payload = await this.request('GET', '/orders', {
      query: { page, limit },
      correlationId
    });
    return {
      ...payload,
      orders: this.extractOrders(payload)
    };
  }

  async updateOrderStatus({ externalOrderId, payload, correlationId = null }) {
    return this.request('POST', `/orders/${externalOrderId}/status`, {
      body: payload,
      correlationId
    });
  }

  async request(method, path, { query = null, body = null, correlationId = null } = {}) {
    this.assertConfigured();
    const url = new URL(path, this.baseUrl);
    if (query && typeof query === 'object') {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const data = await parseResponseBody(response);
      if (!response.ok) {
        const providerError = extractProviderError(data);
        throw new TinyApiError(`Tiny ${method} ${path} failed: ${response.status} ${providerError.message}`.trim(), {
          status: mapHttpStatus(response.status),
          details: {
            tinyStatus: response.status,
            providerError,
            response: data
          }
        });
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new TinyApiError(`Tiny ${method} ${path} timed out after ${this.timeoutMs}ms`, {
          status: 504
        });
      }
      if (error instanceof TinyApiError) throw error;
      throw new TinyApiError(`Tiny ${method} ${path} transport error: ${error.message}`, {
        status: 502,
        details: { cause: error.message }
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  extractOrders(payload) {
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.orders)) return payload.orders;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.retorno && Array.isArray(payload.retorno.pedidos)) return payload.retorno.pedidos;
    if (payload.retorno && payload.retorno.pedidos && Array.isArray(payload.retorno.pedidos.pedido)) return payload.retorno.pedidos.pedido;
    return [];
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

function extractProviderError(payload) {
  if (!payload || typeof payload !== 'object') return { message: 'unknown provider error' };
  const fromRetorno = payload?.retorno?.erros || payload?.retorno?.erro;
  if (typeof payload.error === 'string') return { message: payload.error };
  if (typeof payload.message === 'string') return { message: payload.message };
  if (Array.isArray(fromRetorno) && fromRetorno.length) {
    return { message: fromRetorno.map((e) => e?.erro || e?.mensagem || JSON.stringify(e)).join('; ') };
  }
  if (fromRetorno && typeof fromRetorno === 'object') {
    return { message: fromRetorno.erro || fromRetorno.mensagem || JSON.stringify(fromRetorno) };
  }
  return { message: 'provider returned non-success response' };
}

function mapHttpStatus(status) {
  if (status === 401 || status === 403) return 502;
  if (status === 404) return 502;
  if (status >= 500) return 502;
  return 400;
}
