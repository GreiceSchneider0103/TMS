import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerDistributionCenterRoutes(app) {
  app.get('/distribution-centers', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query('select * from app.distribution_centers where account_id = $1 and deleted_at is null order by created_at desc', [ctx.accountId]);
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/distribution-centers/:id', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.distribution_centers where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Distribution center not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.post('/distribution-centers', requireAnyRole(['admin'], async ({ ctx, body }) => {
    const company = await query('select id from app.companies where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, body.companyId]);
    if (!company.rows[0]) throw new Error('Company not found or inactive');

    const existing = await query(
      `select * from app.distribution_centers
       where account_id = $1 and company_id = $2 and lower(name) = lower($3) and deleted_at is null
       limit 1`,
      [ctx.accountId, body.companyId, body.name]
    );
    if (existing.rows[0]) return { ...existing.rows[0], reused: true, correlationId: ctx.correlationId };

    const { rows } = await query(
      `insert into app.distribution_centers(account_id, company_id, name, postal_code, city, state, address_line, operating_hours, is_active)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [ctx.accountId, body.companyId, body.name, body.postalCode, body.city, body.state, body.addressLine, body.operatingHours || {}, body.isActive ?? true]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/distribution-centers/:id', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    if (body.companyId) {
      const company = await query('select id from app.companies where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, body.companyId]);
      if (!company.rows[0]) throw new Error('Company not found or inactive');
    }

    const { rows } = await query(
      `update app.distribution_centers
       set company_id = coalesce($3, company_id), name = coalesce($4, name), postal_code = coalesce($5, postal_code), city = coalesce($6, city), state = coalesce($7, state),
           address_line = coalesce($8, address_line), operating_hours = coalesce($9, operating_hours), is_active = coalesce($10, is_active), updated_at = now()
       where account_id = $1 and id = $2 and deleted_at is null returning *`,
      [ctx.accountId, params.id, body.companyId, body.name, body.postalCode, body.city, body.state, body.addressLine, body.operatingHours, body.isActive]
    );
    if (!rows[0]) throw new Error('Distribution center not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/distribution-centers/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.distribution_centers set deleted_at = now(), updated_at = now(), is_active = false where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
