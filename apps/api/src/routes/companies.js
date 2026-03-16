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
    const payload = normalizeCompanyInput(body);
    validateCompany(payload);

    const existing = await query('select * from app.companies where account_id = $1 and cnpj = $2 and deleted_at is null limit 1', [ctx.accountId, payload.cnpj]);
    if (existing.rows[0]) {
      const { rows } = await query(
        `update app.companies
         set trade_name = coalesce($3, trade_name), legal_name = coalesce($4, legal_name),
             postal_code = coalesce($5, postal_code), city = coalesce($6, city), state = coalesce($7, state), address_line = coalesce($8, address_line), updated_at = now()
         where account_id = $1 and id = $2
         returning *`,
        [ctx.accountId, existing.rows[0].id, payload.tradeName, payload.legalName, payload.postalCode, payload.city, payload.state, payload.addressLine]
      );
      return { ...rows[0], reused: true, correlationId: ctx.correlationId };
    }

    const { rows } = await query(
      `insert into app.companies(account_id, cnpj, trade_name, legal_name, postal_code, city, state, address_line)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [ctx.accountId, payload.cnpj, payload.tradeName, payload.legalName, payload.postalCode, payload.city, payload.state, payload.addressLine]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/companies/:id', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    const payload = normalizeCompanyInput(body);
    validateCompany(payload, { partial: true });

    const { rows } = await query(
      `update app.companies
       set cnpj = coalesce($3, cnpj), trade_name = coalesce($4, trade_name), legal_name = coalesce($5, legal_name),
           postal_code = coalesce($6, postal_code), city = coalesce($7, city), state = coalesce($8, state), address_line = coalesce($9, address_line), updated_at = now()
       where account_id = $1 and id = $2 and deleted_at is null
       returning *`,
      [ctx.accountId, params.id, payload.cnpj, payload.tradeName, payload.legalName, payload.postalCode, payload.city, payload.state, payload.addressLine]
    );
    if (!rows[0]) throw new Error('Company not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/companies/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.companies set deleted_at = now(), updated_at = now() where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}

function normalizeCompanyInput(body = {}) {
  return {
    cnpj: body.cnpj !== undefined ? String(body.cnpj || '').replace(/\D/g, '') : undefined,
    tradeName: body.tradeName !== undefined ? String(body.tradeName || '').trim() : undefined,
    legalName: body.legalName !== undefined ? String(body.legalName || '').trim() : undefined,
    postalCode: body.postalCode !== undefined ? String(body.postalCode || '').replace(/\D/g, '') : undefined,
    city: body.city !== undefined ? String(body.city || '').trim() : undefined,
    state: body.state !== undefined ? String(body.state || '').trim().toUpperCase() : undefined,
    addressLine: body.addressLine !== undefined ? String(body.addressLine || '').trim() : undefined
  };
}

function validateCompany(payload, { partial = false } = {}) {
  if (!partial && !payload.cnpj) throw new Error('cnpj is required');
  if (!partial && !payload.tradeName) throw new Error('tradeName is required');
  if (!partial && !payload.legalName) throw new Error('legalName is required');
  if (!partial && !payload.postalCode) throw new Error('postalCode is required');
  if (!partial && !payload.city) throw new Error('city is required');
  if (!partial && !payload.state) throw new Error('state is required');
  if (!partial && !payload.addressLine) throw new Error('addressLine is required');

  if ((partial ? payload.cnpj !== undefined : true) && payload.cnpj && payload.cnpj.length !== 14) {
    throw new Error('cnpj must have 14 digits');
  }
  if ((partial ? payload.tradeName !== undefined : true) && !payload.tradeName) {
    throw new Error('tradeName is required');
  }
  if ((partial ? payload.legalName !== undefined : true) && !payload.legalName) {
    throw new Error('legalName is required');
  }
  if ((partial ? payload.postalCode !== undefined : true) && payload.postalCode.length !== 8) {
    throw new Error('postalCode must have 8 digits');
  }
  if ((partial ? payload.state !== undefined : true) && payload.state.length !== 2) {
    throw new Error('state must have 2 characters');
  }
}
