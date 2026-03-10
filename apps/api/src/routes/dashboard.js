import { query } from '../db.js';
import { getAccountId } from '../utils/context.js';

export function registerDashboardRoutes(app) {
  app.get('/dashboard/summary', async ({ req, query: qs }) => {
    const accountId = getAccountId(req);
    const from = qs.from || '1970-01-01';
    const to = qs.to || '2999-12-31';

    const totals = await query(
      `select
        count(*) as orders_total,
        count(*) filter (where status = 'READY_FOR_QUOTE') as pending_quote,
        count(*) filter (where status = 'QUOTED') as quoted,
        sum(coalesce(shipping_amount,0)) as freight_revenue
       from app.orders
       where account_id = $1 and created_at::date between $2 and $3`,
      [accountId, from, to]
    );

    const shipmentStats = await query(
      `select
        count(*) filter (where status = 'DISPATCHED') as dispatched,
        count(*) filter (where status = 'IN_TRANSIT') as in_transit,
        count(*) filter (where status = 'DELIVERED') as delivered,
        count(*) filter (where status = 'EXCEPTION') as exceptions,
        count(*) filter (where status = 'RETURNED') as returned
      from app.shipments
      where account_id = $1 and created_at::date between $2 and $3`,
      [accountId, from, to]
    );

    const carriers = await query(
      `select c.name as carrier,
              count(s.id) as shipments,
              avg(qr.total_days) as avg_sla_days,
              sum(coalesce(qr.total_amount,0)) as freight_cost
       from app.shipments s
       left join app.carriers c on c.id = s.carrier_id
       left join app.quote_results qr on qr.id = s.quote_result_id
       where s.account_id = $1 and s.created_at::date between $2 and $3
       group by c.name
       order by shipments desc`,
      [accountId, from, to]
    );

    return {
      ...totals.rows[0],
      ...shipmentStats.rows[0],
      byCarrier: carriers.rows
    };
  });
}
