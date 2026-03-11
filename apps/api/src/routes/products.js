import { query, transaction } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerProductRoutes(app) {
  app.get('/products', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query(
      `select p.*, pl.weight_kg, pl.length_cm, pl.width_cm, pl.height_cm
       from app.products p
       left join app.product_logistics pl on pl.product_id = p.id and pl.account_id = p.account_id
       where p.account_id = $1 and p.deleted_at is null
       order by p.created_at desc`,
      [ctx.accountId]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/products/:id', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.products where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Product not found');
    const logistics = await query('select * from app.product_logistics where account_id = $1 and product_id = $2', [ctx.accountId, params.id]);
    return { ...rows[0], logistics: logistics.rows[0] || null, correlationId: ctx.correlationId };
  }));

  app.post('/products', requireAnyRole(['admin'], async ({ ctx, body }) => {
    if (!body.skuInternal) throw new Error('skuInternal is required');
    if (!body.name) throw new Error('name is required');
    const out = await transaction(async (client) => {
      const p = await client.query(
        `insert into app.products(account_id, sku_internal, sku_external, name, category)
         values($1,$2,$3,$4,$5) returning *`,
        [ctx.accountId, body.skuInternal, body.skuExternal || null, body.name, body.category || null]
      );
      if (body.logistics) {
        await client.query(
          `insert into app.product_logistics(product_id, account_id, weight_kg, length_cm, width_cm, height_cm, cubing_factor, classification, restrictions)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [p.rows[0].id, ctx.accountId, body.logistics.weightKg, body.logistics.lengthCm, body.logistics.widthCm, body.logistics.heightCm, body.logistics.cubingFactor || 300, body.logistics.classification || null, body.logistics.restrictions || {}]
        );
      }
      return p.rows[0];
    });
    return { ...out, correlationId: ctx.correlationId };
  }));

  app.patch('/products/:id', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    const { rows } = await query(
      `update app.products set sku_internal = coalesce($3, sku_internal), sku_external = coalesce($4, sku_external),
       name = coalesce($5, name), category = coalesce($6, category)
       where account_id = $1 and id = $2 and deleted_at is null returning *`,
      [ctx.accountId, params.id, body.skuInternal, body.skuExternal, body.name, body.category]
    );
    if (!rows[0]) throw new Error('Product not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/products/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.products set deleted_at = now() where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
