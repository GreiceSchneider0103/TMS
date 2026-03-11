import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerCarrierServiceRoutes(app) {
  app.get('/carrier-services', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, query: qs }) => {
    const { rows } = await query('select * from app.carrier_services where account_id = $1 and deleted_at is null and ($2::uuid is null or carrier_id = $2) order by created_at desc', [ctx.accountId, qs.carrierId || null]);
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/carrier-services/:id', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.carrier_services where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Carrier service not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.post('/carrier-services', requireAnyRole(['admin'], async ({ ctx, body }) => {
    const { rows } = await query(
      `insert into app.carrier_services(account_id, carrier_id, name, sla_days, constraints, is_active)
       values($1,$2,$3,$4,$5,$6) returning *`,
      [ctx.accountId, body.carrierId, body.name, body.slaDays || 5, body.constraints || {}, body.isActive ?? true]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/carrier-services/:id', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    const { rows } = await query(
      `update app.carrier_services
       set name = coalesce($3, name), sla_days = coalesce($4, sla_days), constraints = coalesce($5, constraints), is_active = coalesce($6, is_active)
       where account_id = $1 and id = $2 and deleted_at is null returning *`,
      [ctx.accountId, params.id, body.name, body.slaDays, body.constraints, body.isActive]
    );
    if (!rows[0]) throw new Error('Carrier service not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/carrier-services/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.carrier_services set deleted_at = now(), is_active = false where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
