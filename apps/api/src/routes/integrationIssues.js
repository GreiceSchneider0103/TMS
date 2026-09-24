import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { HttpError } from '../utils/router.js';
import { logAudit } from '../services/audit.js';
import { processOrderIntake } from '../services/orderIntake.js';

const READ = ['admin', 'operador_logistico', 'analista_integracao', 'financeiro', 'visualizador'];
const WRITE = ['admin', 'operador_logistico', 'analista_integracao'];

export function registerIntegrationIssueRoutes(app) {
  app.get('/integration-issues', requireAnyRole(READ, async ({ ctx, query: qs }) => {
    const status = ['aberto', 'resolvido', 'descartado'].includes(qs.status) ? qs.status : 'aberto';
    const { rows } = await query(
      `select i.*, o.order_number, o.channel, o.status as order_status
       from app.integration_issues i left join app.orders o on o.id = i.order_id
       where i.account_id = $1 and i.status = $2 and ($3::text is null or i.reason = $3) and ($4::uuid is null or i.order_id = $4)
       order by i.last_seen_at desc limit 500`,
      [ctx.accountId, status, qs.reason || null, qs.orderId || null]
    );
    const counts = await query(
      `select reason, count(*)::int as n from app.integration_issues where account_id = $1 and status = 'aberto' group by reason`,
      [ctx.accountId]
    );
    const ignored = await query('select count(*)::int as n from app.orders where account_id = $1 and integration_ignored', [ctx.accountId]);
    return {
      items: rows,
      counts: Object.fromEntries(counts.rows.map((r) => [r.reason, r.n])),
      ignoredOrders: ignored.rows[0].n,
      correlationId: ctx.correlationId
    };
  }));

  // Tenta de novo (depois de corrigir CEP, cadastrar de-para ou publicar tabela).
  app.post('/integration-issues/:id/reprocess', requireAnyRole(WRITE, async ({ ctx, params }) => {
    const { rows } = await query('select * from app.integration_issues where account_id = $1 and id = $2', [ctx.accountId, params.id]);
    const issue = rows[0];
    if (!issue) throw new HttpError(404, 'Pendência não encontrada.');
    if (!issue.order_id) throw new HttpError(400, 'Esta pendência não tem pedido para reprocessar. Sincronize o canal novamente.');
    const result = await processOrderIntake({ accountId: ctx.accountId, orderId: issue.order_id, source: issue.source });
    const still = await query("select status from app.integration_issues where id = $1", [issue.id]);
    return { resolved: still.rows[0]?.status !== 'aberto', result, correlationId: ctx.correlationId };
  }));

  app.post('/integration-issues/reprocess-all', requireAnyRole(WRITE, async ({ ctx, body }) => {
    const { rows } = await query(
      `select distinct order_id, source from app.integration_issues where account_id = $1 and status = 'aberto' and order_id is not null and ($2::text is null or reason = $2) limit 200`,
      [ctx.accountId, body.reason || null]
    );
    let resolved = 0;
    for (const r of rows) {
      const res = await processOrderIntake({ accountId: ctx.accountId, orderId: r.order_id, source: r.source });
      if (!res.issues.length) resolved += 1;
    }
    return { processed: rows.length, resolved, correlationId: ctx.correlationId };
  }));

  app.post('/integration-issues/:id/discard', requireAnyRole(WRITE, async ({ ctx, params }) => {
    const { rows } = await query(
      "update app.integration_issues set status = 'descartado', resolved_at = now() where account_id = $1 and id = $2 and status = 'aberto' returning id",
      [ctx.accountId, params.id]
    );
    if (!rows[0]) throw new HttpError(404, 'Pendência não encontrada ou já encerrada.');
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'integration_issue', entityId: params.id, action: 'discard', correlationId: ctx.correlationId });
    return { discarded: true, correlationId: ctx.correlationId };
  }));
}
