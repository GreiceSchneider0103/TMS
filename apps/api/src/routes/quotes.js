import crypto from 'node:crypto';
import { query, transaction } from '../db.js';
import { calculateRouteQuote, computeWeights } from '../services/freightEngine.js';
import { applyShippingRules } from '../services/rulesEngine.js';
import { getAccountId, getUserId } from '../utils/context.js';
import { logAudit } from '../services/audit.js';

export function registerQuoteRoutes(app) {
  app.post('/quotes/manual', async ({ req, body }) => {
    const accountId = getAccountId(req);
    const userId = getUserId(req);
    const requestHash = hashRequest(body);

    const quote = await createAndCalculateQuote({ accountId, body, requestHash });
    await logAudit({ accountId, userId, entity: 'quote_request', entityId: quote.request.id, action: 'manual_quote', afterData: { resultCount: quote.results.length } });
    return quote;
  });

  app.post('/quotes/automatic/:orderId', async ({ req, params }) => {
    const accountId = getAccountId(req);
    const { rows } = await query('select * from app.orders where account_id = $1 and id = $2', [accountId, params.orderId]);
    if (!rows[0]) throw new Error('Order not found');
    const order = rows[0];

    const body = {
      orderId: order.id,
      destinationPostalCode: order.raw_payload?.postal_code || '00000000',
      state: order.raw_payload?.state,
      city: order.raw_payload?.city,
      invoiceAmount: order.invoice_amount || order.total_amount,
      weightKg: Number(order.raw_payload?.weight_kg || 1),
      lengthCm: Number(order.raw_payload?.length_cm || 10),
      widthCm: Number(order.raw_payload?.width_cm || 10),
      heightCm: Number(order.raw_payload?.height_cm || 10),
      recipientType: order.raw_payload?.recipient_type || 'PF',
      channel: order.channel,
      skus: order.raw_payload?.skus || [],
      categories: order.raw_payload?.categories || []
    };

    return createAndCalculateQuote({ accountId, body, requestHash: hashRequest(body) });
  });

  app.patch('/quotes/results/:id/select', async ({ req, params }) => {
    const accountId = getAccountId(req);
    await transaction(async (client) => {
      const selected = await client.query('select request_id from app.quote_results where account_id = $1 and id = $2', [accountId, params.id]);
      if (!selected.rows[0]) throw new Error('Quote result not found');
      const requestId = selected.rows[0].request_id;
      await client.query('update app.quote_results set selected = false where account_id = $1 and request_id = $2', [accountId, requestId]);
      await client.query('update app.quote_results set selected = true where account_id = $1 and id = $2', [accountId, params.id]);
    });
    return { selected: true };
  });
}

async function createAndCalculateQuote({ accountId, body, requestHash }) {
  const existing = await query('select * from app.quote_requests where account_id = $1 and request_hash = $2', [accountId, requestHash]);
  let request = existing.rows[0];

  if (!request) {
    const inserted = await query(
      `insert into app.quote_requests(account_id, order_id, destination_postal_code, invoice_amount, payload, request_hash)
       values($1,$2,$3,$4,$5,$6) returning *`,
      [accountId, body.orderId || null, body.destinationPostalCode, Number(body.invoiceAmount || 0), body, requestHash]
    );
    request = inserted.rows[0];
  }

  const routes = await query(
    `select fr.*, ft.carrier_id from app.freight_routes fr
     join app.freight_table_versions v on v.id = fr.version_id and v.status = 'PUBLISHED'
     join app.freight_tables ft on ft.id = v.table_id
     where fr.account_id = $1`,
    [accountId]
  );

  const recipientFees = await query(
    `select * from app.freight_recipient_fees rf
     join app.freight_table_versions v on v.id = rf.version_id and v.status = 'PUBLISHED'
     where rf.account_id = $1 and rf.recipient_document = coalesce($2, rf.recipient_document)`,
    [accountId, body.recipientDocument || null]
  );

  const baseOptions = routes.rows
    .map((route) => calculateRouteQuote({ route, request: body, recipientFees: recipientFees.rows }))
    .filter(Boolean);

  const weights = computeWeights(body);
  const rules = await query('select * from app.shipping_rules where account_id = $1', [accountId]);
  const ranked = applyShippingRules(baseOptions, rules.rows, { ...body, billableWeight: weights.billableWeight });

  await query('delete from app.quote_results where account_id = $1 and request_id = $2', [accountId, request.id]);
  const persisted = [];
  for (const option of ranked) {
    const ins = await query(
      `insert into app.quote_results(request_id, account_id, carrier_id, total_amount, total_days, ranking, breakdown, applied_rules)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [request.id, accountId, option.carrierId, option.totalAmount, option.totalDays, option.ranking, { ...option.breakdown, justification: option.justification }, option.appliedRules]
    );
    persisted.push(ins.rows[0]);
  }

  return { request, results: persisted };
}

function hashRequest(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
