import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerProductLogisticsRoutes(app) {
  app.get('/product-logistics/:productId', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.product_logistics where account_id = $1 and product_id = $2', [ctx.accountId, params.productId]);
    if (!rows[0]) throw new Error('Product logistics not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.post('/product-logistics', requireAnyRole(['admin'], async ({ ctx, body }) => {
    const payload = normalizeLogisticsInput(body);
    if (!payload.productId) throw new Error('productId is required');

    await assertActiveProduct(ctx.accountId, payload.productId);
    validate(payload);

    const { rows } = await query(
      `insert into app.product_logistics(product_id, account_id, weight_kg, length_cm, width_cm, height_cm, cubing_factor, classification, restrictions)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict(product_id)
       do update set weight_kg = excluded.weight_kg, length_cm = excluded.length_cm, width_cm = excluded.width_cm,
         height_cm = excluded.height_cm, cubing_factor = excluded.cubing_factor, classification = excluded.classification,
         restrictions = excluded.restrictions, updated_at = now()
       returning *`,
      [payload.productId, ctx.accountId, payload.weightKg, payload.lengthCm, payload.widthCm, payload.heightCm, payload.cubingFactor, payload.classification, payload.restrictions]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/product-logistics/:productId', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    await assertActiveProduct(ctx.accountId, params.productId);

    const existing = await query('select * from app.product_logistics where account_id = $1 and product_id = $2', [ctx.accountId, params.productId]);
    if (!existing.rows[0]) throw new Error('Product logistics not found');

    const incoming = normalizeLogisticsInput(body);
    const merged = {
      productId: params.productId,
      weightKg: incoming.weightKg ?? Number(existing.rows[0].weight_kg),
      lengthCm: incoming.lengthCm ?? Number(existing.rows[0].length_cm),
      widthCm: incoming.widthCm ?? Number(existing.rows[0].width_cm),
      heightCm: incoming.heightCm ?? Number(existing.rows[0].height_cm),
      cubingFactor: incoming.cubingFactor ?? Number(existing.rows[0].cubing_factor),
      classification: incoming.classification ?? existing.rows[0].classification,
      restrictions: incoming.restrictions ?? existing.rows[0].restrictions
    };

    validate(merged);

    const { rows } = await query(
      `update app.product_logistics set weight_kg = $3, length_cm = $4, width_cm = $5, height_cm = $6,
       cubing_factor = $7, classification = $8, restrictions = $9, updated_at = now()
       where account_id = $1 and product_id = $2 returning *`,
      [ctx.accountId, params.productId, merged.weightKg, merged.lengthCm, merged.widthCm, merged.heightCm, merged.cubingFactor, merged.classification, merged.restrictions]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/product-logistics/:productId', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('delete from app.product_logistics where account_id = $1 and product_id = $2', [ctx.accountId, params.productId]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}

function normalizeLogisticsInput(body = {}) {
  return {
    productId: body.productId || null,
    weightKg: toNumberOrNull(body.weightKg),
    lengthCm: toNumberOrNull(body.lengthCm),
    widthCm: toNumberOrNull(body.widthCm),
    heightCm: toNumberOrNull(body.heightCm),
    cubingFactor: toNumberOrNull(body.cubingFactor) ?? 300,
    classification: body.classification ?? null,
    restrictions: body.restrictions ?? {}
  };
}

function validate(body) {
  if (!isPositive(body.weightKg) || !isPositive(body.lengthCm) || !isPositive(body.widthCm) || !isPositive(body.heightCm)) {
    throw new Error('weightKg, lengthCm, widthCm and heightCm must be > 0');
  }
  if (!isPositive(body.cubingFactor)) {
    throw new Error('cubingFactor must be > 0');
  }
}

function isPositive(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function assertActiveProduct(accountId, productId) {
  const { rows } = await query('select id from app.products where account_id = $1 and id = $2 and deleted_at is null', [accountId, productId]);
  if (!rows[0]) throw new Error('Product not found or inactive');
}
