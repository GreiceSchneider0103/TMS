import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerCarrierRoutes(app) {
  app.get('/carriers', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query('select * from app.carriers where account_id = $1 and deleted_at is null order by priority asc, created_at desc', [ctx.accountId]);
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/carriers/:id', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.carriers where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Carrier not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.post('/carriers', requireAnyRole(['admin'], async ({ ctx, body }) => {
    const { rows } = await query('insert into app.carriers(account_id, name, external_name, priority, is_active) values($1,$2,$3,$4,$5) returning *', [ctx.accountId, body.name, body.externalName || null, body.priority || 100, body.isActive ?? true]);
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/carriers/:id', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    const { rows } = await query(
      `update app.carriers set name = coalesce($3, name), external_name = coalesce($4, external_name), priority = coalesce($5, priority),
       is_active = coalesce($6, is_active), updated_at = now() where account_id = $1 and id = $2 and deleted_at is null returning *`,
      [ctx.accountId, params.id, body.name, body.externalName, body.priority, body.isActive]
    );
    if (!rows[0]) throw new Error('Carrier not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/carriers/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.carriers set deleted_at = now(), updated_at = now(), is_active = false where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
