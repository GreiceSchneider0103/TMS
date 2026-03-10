import crypto from 'node:crypto';

const mockOrders = [];

export function registerOrderRoutes(app) {
  app.get('/orders', async () => ({ items: mockOrders, total: mockOrders.length }));

  app.post('/orders/import/tiny', async ({ body }) => {
    const order = {
      id: crypto.randomUUID(),
      source: 'tiny',
      externalId: body.externalId,
      number: body.number,
      status: 'READY_FOR_QUOTE',
      createdAt: new Date().toISOString()
    };
    mockOrders.push(order);
    return { imported: true, order };
  });
}
