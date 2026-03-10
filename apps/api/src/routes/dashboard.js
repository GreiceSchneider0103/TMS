export function registerDashboardRoutes(app) {
  app.get('/dashboard/summary', async () => {
    return {
      ordersTotal: 1267,
      waitingDispatch: 142,
      inTransit: 298,
      delivered: 801,
      exceptions: 26,
      overdue: 18,
      byCarrier: [
        { carrier: 'Transportadora Sul', shipments: 412, avgSlaDays: 5.2 },
        { carrier: 'RodoBrasil', shipments: 388, avgSlaDays: 6.1 }
      ]
    };
  });
}
