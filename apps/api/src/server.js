import http from 'node:http';
import { router } from './utils/router.js';
import { registerQuoteRoutes } from './routes/quotes.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerDashboardRoutes } from './routes/dashboard.js';

const app = router();
registerQuoteRoutes(app);
registerOrderRoutes(app);
registerDashboardRoutes(app);

const server = http.createServer(async (req, res) => {
  const handled = await app.handle(req, res);
  if (!handled) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(process.env.PORT || 3001, () => {
  console.log('TMS API running');
});
