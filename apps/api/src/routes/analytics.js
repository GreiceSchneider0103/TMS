import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { HttpError } from '../utils/router.js';
import { controlTower, financial, financialOrders, loadFacts, parseFilters, TOWER_CARDS, towerOrders } from '../services/analytics.js';

const READ = ['admin', 'operador_logistico', 'financeiro', 'visualizador'];

const orderRow = (f) => ({
  id: f.id, order_number: f.order_number, channel: f.channel, status: f.shipment_status || f.status, sold_at: f.sold_at, uf: f.uf, city: f.city,
  carrier_name: f.carrier_name, tracking_code: f.tracking_code, ship_by_date: f.ship_by_date, dispatched_at: f.dispatched_at,
  estimated_delivery_date: f.estimated_delivery_date, promised_delivery_date: f.promised_delivery_date, delivered_at: f.delivered_at,
  exception_text: f.exception_text
});

export function registerAnalyticsRoutes(app) {
  app.get('/analytics/control-tower', requireAnyRole(READ, async ({ ctx, query: qs }) => {
    const filters = parseFilters(qs);
    const facts = await loadFacts(ctx.accountId, filters);
    const issues = await query("select count(*)::int as n from app.integration_issues where account_id = $1 and status = 'aberto'", [ctx.accountId]);
    return { filters, ...controlTower(facts, issues.rows[0].n), correlationId: ctx.correlationId };
  }));

  app.get('/analytics/control-tower/orders', requireAnyRole(READ, async ({ ctx, query: qs }) => {
    if (!TOWER_CARDS.some(([k]) => k === qs.card)) throw new HttpError(400, 'Indicador inválido.');
    const facts = await loadFacts(ctx.accountId, parseFilters(qs));
    return { items: towerOrders(facts, qs.card).map(orderRow), correlationId: ctx.correlationId };
  }));

  app.get('/analytics/financial', requireAnyRole(['admin', 'financeiro', 'operador_logistico'], async ({ ctx, query: qs }) => {
    const filters = parseFilters(qs);
    const facts = await loadFacts(ctx.accountId, filters);
    return { filters, ...financial(facts), correlationId: ctx.correlationId };
  }));

  app.get('/analytics/financial/orders', requireAnyRole(['admin', 'financeiro', 'operador_logistico'], async ({ ctx, query: qs }) => {
    // Filtros globais (período, canal, UF, transportadora) + o recorte clicado (drillCarrierId / drillState).
    const facts = await loadFacts(ctx.accountId, parseFilters(qs));
    return { items: financialOrders(facts, { carrierId: qs.drillCarrierId || null, state: qs.drillState || null }), correlationId: ctx.correlationId };
  }));
}
