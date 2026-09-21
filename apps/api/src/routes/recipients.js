import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerRecipientRoutes(app) {
  app.get('/recipients', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query('select * from app.recipients where account_id = $1 and deleted_at is null order by created_at desc', [ctx.accountId]);
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/recipients/:id', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const { rows } = await query('select * from app.recipients where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Recipient not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.post('/recipients', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, body }) => {
    const document = normalizeDocument(body.document);
    const type = inferRecipientType(body.type, document);

    validateRecipient({ ...body, document, type });

    const existing = await query('select * from app.recipients where account_id = $1 and document = $2 and deleted_at is null limit 1', [ctx.accountId, document]);
    if (existing.rows[0]) {
      const { rows } = await query(
        `update app.recipients
         set legal_name = coalesce($3, legal_name), postal_code = coalesce($4, postal_code), city = coalesce($5, city),
             state = coalesce($6, state), address_line = coalesce($7, address_line), rules = coalesce($8, rules), updated_at = now()
         where account_id = $1 and id = $2
         returning *`,
        [ctx.accountId, existing.rows[0].id, body.legalName, body.postalCode, body.city, body.state, body.addressLine, body.rules]
      );
      return { ...rows[0], reused: true, correlationId: ctx.correlationId };
    }

    const { rows } = await query(
      `insert into app.recipients(account_id, document, legal_name, type, postal_code, city, state, address_line, rules)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [ctx.accountId, document, body.legalName, type, body.postalCode, body.city, body.state, body.addressLine, body.rules || {}]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/recipients/:id', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, params, body }) => {
    const document = body.document ? normalizeDocument(body.document) : null;
    const type = body.type || (document ? inferRecipientType(null, document) : null);

    if (document || type) {
      validateRecipient({ ...body, document: document || '00000000000', type: type || 'PF' }, { partial: true });
    }

    const { rows } = await query(
      `update app.recipients
       set document = coalesce($3, document), legal_name = coalesce($4, legal_name), type = coalesce($5, type),
           postal_code = coalesce($6, postal_code), city = coalesce($7, city), state = coalesce($8, state),
           address_line = coalesce($9, address_line), rules = coalesce($10, rules), updated_at = now()
       where account_id = $1 and id = $2 and deleted_at is null returning *`,
      [ctx.accountId, params.id, document, body.legalName, type, body.postalCode, body.city, body.state, body.addressLine, body.rules]
    );
    if (!rows[0]) throw new Error('Recipient not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/recipients/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.recipients set deleted_at = now(), updated_at = now() where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}

function normalizeDocument(value) {
  return String(value || '').replace(/\D/g, '');
}

function inferRecipientType(type, document) {
  if (type === 'PF' || type === 'PJ') return type;
  if (String(document || '').length === 14) return 'PJ';
  return 'PF';
}

function validateRecipient(body, { partial = false } = {}) {
  const doc = String(body.document || '');
  const legalName = String(body.legalName || '').trim();
  const type = body.type;

  if (!partial || body.document !== undefined) {
    if (!(doc.length === 11 || doc.length === 14)) throw new Error('document must have 11 (CPF) or 14 (CNPJ) digits');
  }

  if (!partial || body.type !== undefined) {
    if (!['PF', 'PJ'].includes(type)) throw new Error('type must be PF or PJ');
  }

  if (!partial || body.legalName !== undefined) {
    if (!legalName) throw new Error('legalName is required');
  }
}
