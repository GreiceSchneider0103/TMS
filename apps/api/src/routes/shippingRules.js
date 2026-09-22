import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { logAudit } from '../services/audit.js';

export function registerShippingRuleRoutes(app) {
  app.get('/shipping-rules', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query('select * from app.shipping_rules where account_id = $1 order by priority asc, created_at desc', [ctx.accountId]);
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.post('/shipping-rules', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, body }) => {
    const payload = normalizeInput(body);
    validate(payload);

    const { rows } = await query(
      `insert into app.shipping_rules(account_id, name, description, priority, active, valid_from, valid_to, conditions, actions)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [ctx.accountId, payload.name, payload.description, payload.priority, payload.active, payload.validFrom, payload.validTo, payload.conditions, payload.actions]
    );
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'shipping_rule', entityId: rows[0].id, action: 'create', afterData: rows[0], correlationId: ctx.correlationId });
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.patch('/shipping-rules/:id', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, params, body }) => {
    const payload = normalizeInput(body, { partial: true });

    const { rows } = await query(
      `update app.shipping_rules
       set name = coalesce($3, name), description = coalesce($4, description), priority = coalesce($5, priority),
           active = coalesce($6, active), valid_from = $7, valid_to = $8,
           conditions = coalesce($9, conditions), actions = coalesce($10, actions)
       where account_id = $1 and id = $2
       returning *`,
      [ctx.accountId, params.id, payload.name, payload.description, payload.priority, payload.active,
        payload.validFrom !== undefined ? payload.validFrom : null, payload.validTo !== undefined ? payload.validTo : null,
        payload.conditions, payload.actions]
    );
    if (!rows[0]) throw new Error('Shipping rule not found');
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'shipping_rule', entityId: params.id, action: 'update', afterData: rows[0], correlationId: ctx.correlationId });
    return { ...rows[0], correlationId: ctx.correlationId };
  }));

  app.delete('/shipping-rules/:id', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, params }) => {
    const { rows } = await query('delete from app.shipping_rules where account_id = $1 and id = $2 returning id', [ctx.accountId, params.id]);
    if (!rows[0]) throw new Error('Shipping rule not found');
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'shipping_rule', entityId: params.id, action: 'delete', correlationId: ctx.correlationId });
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}

function normalizeInput(body = {}, { partial = false } = {}) {
  return {
    name: body.name !== undefined ? String(body.name || '').trim() : (partial ? undefined : ''),
    description: body.description !== undefined ? String(body.description || '').trim() || null : null,
    priority: body.priority !== undefined ? Number(body.priority) : (partial ? undefined : 100),
    active: body.active !== undefined ? Boolean(body.active) : (partial ? undefined : true),
    validFrom: body.validFrom || null,
    validTo: body.validTo || null,
    conditions: body.conditions !== undefined ? body.conditions : (partial ? undefined : {}),
    actions: body.actions !== undefined ? body.actions : (partial ? undefined : {})
  };
}

function validate(payload) {
  if (!payload.name) throw new Error('name is required');
  if (!Number.isFinite(payload.priority)) throw new Error('priority must be a number');
}
