import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerCompaniesRoutes(app) {
  app.get('/companies', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query('select * from app.companies where account_id = $1 and deleted_at is null order by created_at desc', [ctx.accountId]);
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/companies/:id', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.companies where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Company not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.post('/companies', requireAnyRole(['admin'], async ({ ctx, body }) => {
    const { rows } = await query(
      `insert into app.companies(account_id, cnpj, trade_name, legal_name, postal_code, city, state, address_line)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [ctx.accountId, body.cnpj, body.tradeName, body.legalName, body.postalCode, body.city, body.state, body.addressLine]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/companies/:id', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    const { rows } = await query(
      `update app.companies
       set cnpj = coalesce($3, cnpj), trade_name = coalesce($4, trade_name), legal_name = coalesce($5, legal_name),
           postal_code = coalesce($6, postal_code), city = coalesce($7, city), state = coalesce($8, state), address_line = coalesce($9, address_line), updated_at = now()
       where account_id = $1 and id = $2 and deleted_at is null
       returning *`,
      [ctx.accountId, params.id, body.cnpj, body.tradeName, body.legalName, body.postalCode, body.city, body.state, body.addressLine]
    );
    if (!rows[0]) throw new Error('Company not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/companies/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.companies set deleted_at = now(), updated_at = now() where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
