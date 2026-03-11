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
    const { rows } = await query(
      `insert into app.recipients(account_id, document, legal_name, type, postal_code, city, state, address_line, rules)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [ctx.accountId, body.document, body.legalName, body.type || 'PF', body.postalCode, body.city, body.state, body.addressLine, body.rules || {}]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/recipients/:id', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, params, body }) => {
    const { rows } = await query(
      `update app.recipients
       set document = coalesce($3, document), legal_name = coalesce($4, legal_name), type = coalesce($5, type),
           postal_code = coalesce($6, postal_code), city = coalesce($7, city), state = coalesce($8, state),
           address_line = coalesce($9, address_line), rules = coalesce($10, rules), updated_at = now()
       where account_id = $1 and id = $2 and deleted_at is null returning *`,
      [ctx.accountId, params.id, body.document, body.legalName, body.type, body.postalCode, body.city, body.state, body.addressLine, body.rules]
    );
    if (!rows[0]) throw new Error('Recipient not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/recipients/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.recipients set deleted_at = now(), updated_at = now() where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
