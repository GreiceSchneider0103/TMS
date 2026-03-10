export class TinyClient {
  constructor() {
    this.baseUrl = process.env.TINY_BASE_URL;
    this.token = process.env.TINY_API_TOKEN;
  }

  assertConfigured() {
    if (!this.baseUrl || !this.token) {
      throw new Error('Tiny client is not configured: set TINY_BASE_URL and TINY_API_TOKEN');
    }
  }

  async listOrders({ page = 1, limit = 50 } = {}) {
    this.assertConfigured();
    const url = new URL('/orders', this.baseUrl);
    url.searchParams.set('page', page);
    url.searchParams.set('limit', limit);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'content-type': 'application/json'
      }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`Tiny listOrders failed: ${response.status}`);
    return payload;
  }

  async updateOrderStatus({ externalOrderId, payload }) {
    this.assertConfigured();
    const url = new URL(`/orders/${externalOrderId}/status`, this.baseUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Tiny updateOrderStatus failed: ${response.status}`);
    return data;
  }
}
