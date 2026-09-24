import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { HttpError } from '../utils/router.js';
import { logAudit } from '../services/audit.js';
import { processOrderIntake } from '../services/orderIntake.js';

function normalize(body = {}, { partial = false } = {}) {
  const txt = (v) => (v === undefined ? undefined : String(v || '').trim() || null);
  const out = {
    sourceName: txt(body.sourceName),
    sourceService: txt(body.sourceService),
    channel: body.channel === undefined ? undefined : (String(body.channel || '').trim().toLowerCase() || null),
    carrierId: body.carrierId === undefined ? undefined : (body.carrierId || null),
    carrierServiceId: body.carrierServiceId === undefined ? undefined : (body.carrierServiceId || null),
    ignoreIntegration: body.ignoreIntegration === undefined ? undefined : Boolean(body.ignoreIntegration),
    ignoreCost: body.ignoreCost === undefined ? undefined : Boolean(body.ignoreCost)
  };
  if (!partial && !out.sourceName) throw new HttpError(400, 'Informe o nome da transportadora como chega do canal.');
  if (!partial && !out.carrierId && !out.ignoreIntegration) throw new HttpError(400, 'Escolha a transportadora do TMS ou marque "Ignorar integração".');
  return out;
}

// Reprocessa pedidos que estavam pendentes por falta deste de-para.
async function reprocessUnmapped(accountId, sourceName) {
  const { rows } = await query(
    `select distinct order_id, source from app.integration_issues
     where account_id = $1 and status = 'aberto' and reason = 'transportadora_nao_mapeada' and lower(details->>'carrier') = lower($2) and order_id is not null`,
    [accountId, sourceName]
  );
  let fixed = 0;
  for (const r of rows) {
    const res = await processOrderIntake({ accountId, orderId: r.order_id, source: r.source });
    if (!res.issues.includes('transportadora_nao_mapeada')) fixed += 1;
  }
  return fixed;
}

export function registerCarrierMappingRoutes(app) {
  app.get('/carrier-mappings', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query(
      `select m.*, c.name as carrier_name, cs.name as carrier_service_name
       from app.carrier_mappings m
       left join app.carriers c on c.id = m.carrier_id
       left join app.carrier_services cs on cs.id = m.carrier_service_id
       where m.account_id = $1 order by lower(m.source_name), m.source_service nulls first`,
      [ctx.accountId]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.post('/carrier-mappings', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, body }) => {
    const p = normalize(body);
    let row;
    try {
      const { rows } = await query(
        `insert into app.carrier_mappings(account_id, source_name, source_service, channel, carrier_id, carrier_service_id, ignore_integration, ignore_cost)
         values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [ctx.accountId, p.sourceName, p.sourceService, p.channel, p.carrierId, p.carrierServiceId, Boolean(p.ignoreIntegration), Boolean(p.ignoreCost)]
      );
      row = rows[0];
    } catch (error) {
      if (error.code === '23505') throw new HttpError(409, 'Já existe um de-para para esse nome, serviço e canal.');
      throw error;
    }
    const reprocessed = await reprocessUnmapped(ctx.accountId, p.sourceName);
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'carrier_mapping', entityId: row.id, action: 'create', afterData: { name: p.sourceName }, correlationId: ctx.correlationId });
    return { ...row, reprocessed, correlationId: ctx.correlationId };
  }));

  app.patch('/carrier-mappings/:id', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, params, body }) => {
    const p = normalize(body, { partial: true });
    const { rows } = await query(
      `update app.carrier_mappings set
         source_name = coalesce($3, source_name),
         source_service = case when $4::boolean then $5 else source_service end,
         channel = case when $6::boolean then $7 else channel end,
         carrier_id = case when $8::boolean then $9::uuid else carrier_id end,
         carrier_service_id = case when $10::boolean then $11::uuid else carrier_service_id end,
         ignore_integration = coalesce($12, ignore_integration),
         ignore_cost = coalesce($13, ignore_cost),
         updated_at = now()
       where account_id = $1 and id = $2 returning *`,
      [ctx.accountId, params.id, p.sourceName, p.sourceService !== undefined, p.sourceService ?? null, p.channel !== undefined, p.channel ?? null,
        p.carrierId !== undefined, p.carrierId ?? null, p.carrierServiceId !== undefined, p.carrierServiceId ?? null, p.ignoreIntegration ?? null, p.ignoreCost ?? null]
    );
    if (!rows[0]) throw new HttpError(404, 'De-para não encontrado.');
    const reprocessed = await reprocessUnmapped(ctx.accountId, rows[0].source_name);
    return { ...rows[0], reprocessed, correlationId: ctx.correlationId };
  }));

  app.delete('/carrier-mappings/:id', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, params }) => {
    await query('delete from app.carrier_mappings where account_id = $1 and id = $2', [ctx.accountId, params.id]);
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
