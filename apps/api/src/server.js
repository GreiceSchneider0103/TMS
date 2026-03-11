import http from 'node:http';
import { router } from './utils/router.js';
import { registerQuoteRoutes } from './routes/quotes.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerShipmentRoutes } from './routes/shipments.js';
import { registerTrackingRoutes } from './routes/tracking.js';
import { registerFreightTableRoutes } from './routes/freightTables.js';
import { runWithDbContext } from './db.js';
import { registerCompaniesRoutes } from './routes/companies.js';
import { registerDistributionCenterRoutes } from './routes/distributionCenters.js';
import { registerCarrierRoutes } from './routes/carriers.js';
import { registerCarrierServiceRoutes } from './routes/carrierServices.js';
import { registerProductRoutes } from './routes/products.js';
import { registerProductLogisticsRoutes } from './routes/productLogistics.js';
import { registerRecipientRoutes } from './routes/recipients.js';
import { registerLogRoutes } from './routes/logs.js';

const app = router();
registerOrderRoutes(app);
registerQuoteRoutes(app);
registerShipmentRoutes(app);
registerTrackingRoutes(app);
registerFreightTableRoutes(app);
registerDashboardRoutes(app);
registerCompaniesRoutes(app);
registerDistributionCenterRoutes(app);
registerCarrierRoutes(app);
registerCarrierServiceRoutes(app);
registerProductRoutes(app);
registerProductLogisticsRoutes(app);
registerRecipientRoutes(app);
registerLogRoutes(app);

app.get('/health', async () => ({ ok: true }));

const server = http.createServer(async (req, res) => {
  await runWithDbContext(null, async () => {
    const handled = await app.handle(req, res);
    if (!handled) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log('TMS API running');
});
