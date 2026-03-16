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
    const carrier = await query('select id from app.carriers where account_id = $1 and id = $2 and deleted_at is null and is_active = true', [ctx.accountId, body.carrierId]);
    if (!carrier.rows[0]) throw new Error('Carrier not found or inactive');

    const existing = await query(
      `select * from app.carrier_services
       where account_id = $1 and carrier_id = $2 and lower(name) = lower($3) and deleted_at is null
       limit 1`,
      [ctx.accountId, body.carrierId, body.name]
    );
    if (existing.rows[0]) return { ...existing.rows[0], reused: true, correlationId: ctx.correlationId };

    const { rows } = await query(
      `insert into app.carrier_services(account_id, carrier_id, name, sla_days, constraints, is_active)
       values($1,$2,$3,$4,$5,$6) returning *`,
      [ctx.accountId, body.carrierId, body.name, body.slaDays || 5, body.constraints || {}, body.isActive ?? true]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/carrier-services/:id', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    if (body.carrierId) {
      const carrier = await query('select id from app.carriers where account_id = $1 and id = $2 and deleted_at is null and is_active = true', [ctx.accountId, body.carrierId]);
      if (!carrier.rows[0]) throw new Error('Carrier not found or inactive');
    }

    const { rows } = await query(
      `update app.carrier_services
       set carrier_id = coalesce($3, carrier_id), name = coalesce($4, name), sla_days = coalesce($5, sla_days), constraints = coalesce($6, constraints), is_active = coalesce($7, is_active), updated_at = now()
       where account_id = $1 and id = $2 and deleted_at is null returning *`,
      [ctx.accountId, params.id, body.carrierId, body.name, body.slaDays, body.constraints, body.isActive]
    );
    if (!rows[0]) throw new Error('Carrier service not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/carrier-services/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.carrier_services set deleted_at = now(), is_active = false, updated_at = now() where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
