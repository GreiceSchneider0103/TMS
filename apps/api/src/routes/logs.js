import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerLogRoutes(app) {
  app.get('/logs/audit', requireAnyRole(['admin', 'analista_integracao', 'financeiro'], async ({ ctx, query: qs }) => {
    const { rows } = await query(
      `select * from app.audit_logs
       where account_id = $1
         and ($2::text is null or entity_id = $2)
         and ($3::text is null or correlation_id = $3)
         and created_at::date between $4 and $5
       order by created_at desc
       limit 200`,
      [ctx.accountId, qs.entity_id || null, qs.correlation_id || null, qs.from || '1970-01-01', qs.to || '2999-12-31']
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/logs/sync', requireAnyRole(['admin', 'analista_integracao'], async ({ ctx, query: qs }) => {
    const { rows } = await query(
      `select * from app.sync_jobs
       where account_id = $1
         and ($2::text is null or status = $2)
         and ($3::text is null or correlation_id = $3)
         and created_at::date between $4 and $5
       order by created_at desc
       limit 200`,
      [ctx.accountId, qs.status || null, qs.correlation_id || null, qs.from || '1970-01-01', qs.to || '2999-12-31']
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/logs/webhooks', requireAnyRole(['admin', 'analista_integracao'], async ({ ctx, query: qs }) => {
    const { rows } = await query(
      `select * from app.webhook_logs
       where account_id = $1
         and ($2::text is null or status = $2)
         and ($3::text is null or correlation_id = $3)
         and received_at::date between $4 and $5
       order by received_at desc
       limit 200`,
      [ctx.accountId, qs.status || null, qs.correlation_id || null, qs.from || '1970-01-01', qs.to || '2999-12-31']
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));
}
