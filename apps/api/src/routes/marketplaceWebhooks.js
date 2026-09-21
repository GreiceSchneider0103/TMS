import crypto from 'node:crypto';
import { query, setDbContext } from '../db.js';
import { normalizeRole } from '../utils/rbac.js';
import { HttpError } from '../utils/router.js';

// Public webhook (no session RBAC): authenticated by an app.api_credentials
// token embedded in the URL, exactly like the x-api-key flow but for
// marketplace-to-server callbacks that can't send custom headers.
export function registerMarketplaceWebhookRoutes(app) {
  app.post('/webhooks/magalu/frete/:token', async ({ req, res, params, body }) => {
    const correlationId = crypto.randomUUID();
    let accountId;
    try {
      const auth = await query('select * from app.authenticate_api_key($1)', [params.token]);
      if (!auth.rows[0]) throw new HttpError(401, 'Invalid token');
      await query('select app.touch_api_credential($1)', [auth.rows[0].credential_id]);

      accountId = auth.rows[0].account_id;
      setDbContext({
        accountId,
        role: normalizeRole(auth.rows[0].role),
        correlationId,
        userId: '00000000-0000-0000-0000-000000000000'
      });
    } catch (error) {
      writeJson(res, error instanceof HttpError ? error.status : 401, {
        code: 'unauthorized',
        message: 'Invalid or inactive token'
      });
      return;
    }

    let quote;
    try {
      quote = buildQuoteInput(body);
    } catch (error) {
      await logWebhook({ accountId, status: 'error', payload: body, error: error.message, correlationId });
      writeJson(res, 400, { code: 'invalid_request', message: error.message });
      return;
    }

    const routes = await query(
      `select fr.*, ft.carrier_id, c.name as carrier_name
       from app.freight_routes fr
       join app.freight_table_versions v on v.id = fr.version_id and v.status = 'PUBLISHED'
       join app.freight_tables ft on ft.id = v.table_id
       join app.carriers c on c.id = ft.carrier_id
       where fr.account_id = $1 and c.is_active = true`,
      [accountId]
    );

    const candidates = routes.rows
      .map((route) => priceRoute(route, quote))
      .filter(Boolean)
      .sort((a, b) => a.price - b.price);

    if (!candidates.length) {
      await logWebhook({ accountId, status: 'no_option', payload: body, response: null, correlationId });
      writeJson(res, 400, { code: 'delivery_not_available', message: 'Delivery Not Available' });
      return;
    }

    const responseBody = {
      packages: [
        {
          items: quote.items.map((it) => ({ sku: it.sku, quantity: it.quantity })),
          delivery_options: candidates.slice(0, 3).map((c) => ({
            id: c.routeId,
            type: 'conventional',
            name: c.carrierName || 'Entrega',
            price: c.price.toFixed(2),
            delivery_days: c.days
          }))
        }
      ]
    };

    await logWebhook({ accountId, status: 'quoted', payload: body, response: responseBody, correlationId });
    writeJson(res, 200, responseBody);
  });
}

function buildQuoteInput(body) {
  const zipcode = String(body?.zipcode || '').replace(/\D/g, '');
  if (zipcode.length !== 8) throw new Error('zipcode inválido');

  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) throw new Error('items vazio');

  let totalWeightKg = 0;
  let totalVolumeCm3 = 0;
  let totalInvoice = 0;
  const normalizedItems = [];

  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const dims = item.dimensions || {};
    const weightKg = Number(dims.weight || 0);
    const widthCm = Number(dims.width || 0) * 100;
    const depthCm = Number(dims.depth || 0) * 100;
    const heightCm = Number(dims.height || 0) * 100;
    const price = Number(item.price || 0);

    totalWeightKg += weightKg * quantity;
    totalVolumeCm3 += widthCm * depthCm * heightCm * quantity;
    totalInvoice += price * quantity;

    normalizedItems.push({ sku: item.sku, quantity });
  }

  return { zipcode, totalWeightKg, totalVolumeCm3, totalInvoice, items: normalizedItems };
}

function priceRoute(route, quote) {
  const cubingFactor = Number(route.cubing_factor || 300);
  const cubicWeight = quote.totalVolumeCm3 / cubingFactor;
  const billableWeight = Math.max(quote.totalWeightKg, cubicWeight);

  if (billableWeight < Number(route.min_weight) || billableWeight > Number(route.max_weight)) return null;
  if (!cepInRange(quote.zipcode, route.cep_start, route.cep_end)) return null;

  const base = Number(route.base_amount);
  const excess = Math.max(0, billableWeight - Number(route.min_weight)) * Number(route.extra_per_kg || 0);
  const baseWithMin = Math.max(base + excess, Number(route.min_freight || 0));
  const adValorem = quote.totalInvoice * (Number(route.ad_valorem_pct || 0) / 100);
  const gris = quote.totalInvoice * (Number(route.gris_pct || 0) / 100);
  const trt = Number(route.trt_amount || 0);
  const tda = Number(route.tda_amount || 0);
  const total = baseWithMin + adValorem + gris + trt + tda;

  return {
    routeId: route.id,
    carrierName: route.carrier_name,
    price: Number(total.toFixed(2)),
    days: Number(route.sla_days || 0)
  };
}

function cepInRange(cep, start, end) {
  const value = Number(String(cep).replace(/\D/g, ''));
  return value >= Number(String(start).replace(/\D/g, '')) && value <= Number(String(end).replace(/\D/g, ''));
}

async function logWebhook({ accountId, status, payload, response = null, error = null, correlationId }) {
  try {
    await query(
      `insert into app.webhook_logs(account_id, provider, event_type, status, payload, response, error, correlation_id)
       values ($1,'magalu','frete_quote',$2,$3,$4,$5,$6)`,
      [accountId, status, JSON.stringify(payload || {}), response ? JSON.stringify(response) : null, error, correlationId]
    );
  } catch (e) {
    console.error(JSON.stringify({ event: 'webhook_log_failed', message: e.message }));
  }
}

function writeJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}
