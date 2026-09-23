import crypto from 'node:crypto';
import { query, setDbContext } from '../db.js';
import { normalizeRole } from '../utils/rbac.js';
import { HttpError } from '../utils/router.js';

// Public webhook (no session RBAC): authenticated by an app.api_credentials
// token embedded in the URL, same pattern as the Magalu webhook. Shopee's
// "Envio pelo Vendedor" (Seller Logistics / custom channel) calls this URL
// to get a shipping fee quote for the product page, using the freight table
// already published in the TMS.
//
// Shopee also signs Open Platform push callbacks with HMAC-SHA256 over the
// raw request body using the shop's Partner Key. That key is not configured
// yet (Shopee Open Platform account still pending), so signature
// verification only runs when SHOPEE_PARTNER_KEY is set in the environment;
// until then the endpoint relies solely on the URL token. Set
// SHOPEE_PARTNER_KEY once the Shopee Open Platform credentials exist to
// enable verification.
export function registerShopeeWebhookRoutes(app) {
  app.post('/webhooks/shopee/frete/:token', async ({ req, res, params, body }) => {
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
        message: 'Token inválido ou inativo'
      });
      return;
    }

    if (process.env.SHOPEE_PARTNER_KEY) {
      const signature = req.headers['authorization'] || req.headers['shopee-signature'];
      const valid = verifyShopeeSignature({
        rawBody: req.rawBody,
        signature,
        partnerKey: process.env.SHOPEE_PARTNER_KEY
      });
      if (!valid) {
        await logWebhook({ accountId, status: 'error', payload: body, error: 'invalid_signature', correlationId });
        writeJson(res, 401, { code: 0, msg: 'invalid signature' });
        return;
      }
    }

    let quote;
    try {
      quote = buildQuoteInput(body);
    } catch (error) {
      await logWebhook({ accountId, status: 'error', payload: body, error: error.message, correlationId });
      writeJson(res, 400, { code: 1, msg: error.message });
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
      writeJson(res, 200, { code: 1, msg: 'no shipping option available for this destination' });
      return;
    }

    const best = candidates[0];
    const responseBody = {
      code: 0,
      msg: 'success',
      shipping_fee: best.price,
      currency: 'BRL',
      estimated_days: best.days,
      carrier: best.carrierName || 'Transportadora'
    };

    await logWebhook({ accountId, status: 'quoted', payload: body, response: responseBody, correlationId });
    writeJson(res, 200, responseBody);
  });
}

function buildQuoteInput(body) {
  const zipcodeRaw = body?.to_postal_code ?? body?.zipcode ?? body?.destination_postal_code ?? '';
  const zipcode = String(zipcodeRaw).replace(/\D/g, '');
  if (zipcode.length !== 8) throw new Error('CEP de destino inválido');

  const weightGrams = Number(body?.weight ?? body?.item_weight ?? 0);
  const weightKg = weightGrams > 100 ? weightGrams / 1000 : Number(body?.weight_kg ?? weightGrams);
  if (!weightKg || weightKg <= 0) throw new Error('Peso do item inválido');

  const invoiceAmount = Number(body?.item_price ?? body?.invoice_amount ?? 0);
  const dims = body?.dimension || body?.dimensions || {};
  const widthCm = Number(dims.width || 0);
  const depthCm = Number(dims.length || dims.depth || 0);
  const heightCm = Number(dims.height || 0);
  const totalVolumeCm3 = widthCm * depthCm * heightCm;

  return { zipcode, totalWeightKg: weightKg, totalVolumeCm3, totalInvoice: invoiceAmount };
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

function verifyShopeeSignature({ rawBody, signature, partnerKey }) {
  if (!signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', partnerKey).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

async function logWebhook({ accountId, status, payload, response = null, error = null, correlationId }) {
  try {
    await query(
      `insert into app.webhook_logs(account_id, provider, event_type, status, payload, response, error, correlation_id)
       values ($1,'shopee','frete_quote',$2,$3,$4,$5,$6)`,
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
