export class TinyWorkerClient {
  constructor({ baseUrl, token, timeoutMs = 15000 }) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.timeoutMs = Number(timeoutMs);
  }

  assertConfigured() {
    if (!this.baseUrl || !this.token) {
      throw new Error('Tiny worker client is not configured: set TINY_BASE_URL and TINY_API_TOKEN');
    }
  }

  async updateOrderStatus({ externalOrderId, payload, correlationId }) {
    this.assertConfigured();
    const url = new URL(`/orders/${externalOrderId}/status`, this.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {})
        },
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      const bodyData = await parseBody(response);
      if (!response.ok) {
        const err = new Error(`Tiny update status failed: ${response.status}`);
        err.code = 'TINY_HTTP_ERROR';
        err.providerStatus = response.status;
        err.providerBody = bodyData;
        throw err;
      }
      return bodyData;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const err = new Error(`Tiny request timeout after ${this.timeoutMs}ms`);
        err.code = 'TINY_TIMEOUT';
        throw err;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
