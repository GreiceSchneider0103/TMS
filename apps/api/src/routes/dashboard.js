import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';

export function registerDashboardRoutes(app) {
  app.get('/dashboard/summary', requireAnyRole(['financeiro', 'operador_logistico', 'visualizador'], async ({ ctx, query: qs }) => {
    const from = qs.from || '1970-01-01';
    const to = qs.to || '2999-12-31';
    const channel = qs.channel || null;
    const carrierId = qs.carrierId || null;
    const state = qs.state || null;

    const totals = await query(
      `select count(*) as orders_total,
              count(*) filter (where status = 'READY_FOR_QUOTE') as pending_quote,
              count(*) filter (where status = 'QUOTED') as quoted,
              sum(coalesce(shipping_amount,0)) as freight_revenue
       from app.orders
       where account_id = $1 and created_at::date between $2 and $3 and ($4::text is null or channel = $4)`,
      [ctx.accountId, from, to, channel]
    );

    const shipmentStats = await query(
      `select count(*) filter (where status = 'DISPATCHED') as pending_dispatch,
              count(*) filter (where status = 'IN_TRANSIT') as in_transit,
              count(*) filter (where status = 'DELIVERED') as delivered,
              count(*) filter (where status = 'EXCEPTION') as exceptions,
              count(*) filter (where status = 'RETURNED') as returned,
              count(*) filter (where status in ('DISPATCHED','IN_TRANSIT') and created_at < now() - interval '10 day') as delayed
       from app.shipments
       where account_id = $1 and created_at::date between $2 and $3 and ($5::uuid is null or carrier_id = $5)
         and ($4::text is null or exists (select 1 from app.orders o where o.id = app.shipments.order_id and o.raw_payload->>'state' = $4))`,
      [ctx.accountId, from, to, state, carrierId]
    );

    const carriers = await query(
      `select c.name as carrier,
              count(s.id) as shipments,
              avg(qr.total_days) as avg_sla_days,
              sum(coalesce(qr.total_amount,0)) as freight_cost
       from app.shipments s
       left join app.carriers c on c.id = s.carrier_id
       left join app.quote_results qr on qr.id = s.quote_result_id
       left join app.orders o on o.id = s.order_id
       where s.account_id = $1 and s.created_at::date between $2 and $3
         and ($4::text is null or o.channel = $4)
         and ($5::uuid is null or s.carrier_id = $5)
       group by c.name
       order by shipments desc`,
      [ctx.accountId, from, to, channel, carrierId]
    );

    return { ...totals.rows[0], ...shipmentStats.rows[0], byCarrier: carriers.rows, correlationId: ctx.correlationId };
  }));
}
