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
    const payload = normalizeCarrierInput(body, { partial: false });
    validateCarrier(payload);

    const existing = await query('select * from app.carriers where account_id = $1 and lower(name) = lower($2) and deleted_at is null limit 1', [ctx.accountId, payload.name]);
    if (existing.rows[0]) return { ...existing.rows[0], reused: true, correlationId: ctx.correlationId };

    const { rows } = await query(
      'insert into app.carriers(account_id, name, external_name, priority, is_active) values($1,$2,$3,$4,$5) returning *',
      [ctx.accountId, payload.name, payload.externalName || null, payload.priority, payload.isActive]
    );
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/carriers/:id', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    const payload = normalizeCarrierInput(body, { partial: true });
    validateCarrier(payload, { partial: true });

    const { rows } = await query(
      `update app.carriers set name = coalesce($3, name), external_name = coalesce($4, external_name), priority = coalesce($5, priority),
       is_active = coalesce($6, is_active), updated_at = now() where account_id = $1 and id = $2 and deleted_at is null returning *`,
      [ctx.accountId, params.id, payload.name, payload.externalName, payload.priority, payload.isActive]
    );
    if (!rows[0]) throw new Error('Carrier not found');
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/carriers/:id', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('update app.carriers set deleted_at = now(), updated_at = now(), is_active = false where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}

function normalizeCarrierInput(body = {}, { partial = false } = {}) {
  return {
    name: body.name !== undefined ? String(body.name || '').trim() : undefined,
    externalName: body.externalName !== undefined ? String(body.externalName || '').trim() : undefined,
    priority: body.priority !== undefined ? Number(body.priority) : (partial ? undefined : 100),
    isActive: body.isActive ?? (partial ? undefined : true)
  };
}

function validateCarrier(payload, { partial = false } = {}) {
  if (!partial && !payload.name) throw new Error('name is required');
  if (partial && payload.name !== undefined && !payload.name) throw new Error('name cannot be empty');
  if ((partial && payload.priority !== undefined) || !partial) {
    if (!Number.isInteger(payload.priority) || payload.priority < 0) throw new Error('priority must be an integer >= 0');
  }
}
