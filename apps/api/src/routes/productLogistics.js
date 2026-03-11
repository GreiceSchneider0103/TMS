import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerProductLogisticsRoutes(app) {
  app.get('/product-logistics/:productId', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.product_logistics where account_id = $1 and product_id = $2', [ctx.accountId, params.productId]);
    if (!rows[0]) throw new Error('Product logistics not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.post('/product-logistics', requireAnyRole(['admin'], async ({ ctx, body }) => {
    validate(body);
    const { rows } = await query(
      `insert into app.product_logistics(product_id, account_id, weight_kg, length_cm, width_cm, height_cm, cubing_factor, classification, restrictions)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict(product_id)
       do update set weight_kg = excluded.weight_kg, length_cm = excluded.length_cm, width_cm = excluded.width_cm,
         height_cm = excluded.height_cm, cubing_factor = excluded.cubing_factor, classification = excluded.classification,
         restrictions = excluded.restrictions, updated_at = now()
       returning *`,
      [body.productId, ctx.accountId, body.weightKg, body.lengthCm, body.widthCm, body.heightCm, body.cubingFactor || 300, body.classification || null, body.restrictions || {}]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/product-logistics/:productId', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    const existing = await query('select * from app.product_logistics where account_id = $1 and product_id = $2', [ctx.accountId, params.productId]);
    if (!existing.rows[0]) throw new Error('Product logistics not found');
    const merged = {
      ...existing.rows[0],
      weightKg: body.weightKg ?? existing.rows[0].weight_kg,
      lengthCm: body.lengthCm ?? existing.rows[0].length_cm,
      widthCm: body.widthCm ?? existing.rows[0].width_cm,
      heightCm: body.heightCm ?? existing.rows[0].height_cm
    };
    validate(merged);
    const { rows } = await query(
      `update app.product_logistics set weight_kg = $3, length_cm = $4, width_cm = $5, height_cm = $6,
       cubing_factor = coalesce($7, cubing_factor), classification = coalesce($8, classification), restrictions = coalesce($9, restrictions), updated_at = now()
       where account_id = $1 and product_id = $2 returning *`,
      [ctx.accountId, params.productId, merged.weightKg, merged.lengthCm, merged.widthCm, merged.heightCm, body.cubingFactor, body.classification, body.restrictions]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/product-logistics/:productId', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('delete from app.product_logistics where account_id = $1 and product_id = $2', [ctx.accountId, params.productId]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}

function validate(body) {
  if (!body.weightKg || !body.lengthCm || !body.widthCm || !body.heightCm) {
    throw new Error('weightKg, lengthCm, widthCm and heightCm are required');
  }
}
