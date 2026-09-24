import assert from 'node:assert/strict';
import { cepToUf, controlTower, financial, parseFilters } from '../src/services/analytics.js';

export function runAnalyticsTests() {
  assert.equal(cepToUf('01310-100'), 'SP');
  assert.equal(cepToUf('90010000'), 'RS');
  assert.equal(cepToUf('69301000'), 'RR');
  assert.equal(cepToUf('73010000'), 'DF');
  assert.equal(cepToUf('138522'), null);

  const f = parseFilters({ days: '7', to: '2026-09-24' });
  assert.equal(f.from, '2026-09-18');

  const day = 86400000;
  const past = new Date(Date.now() - 3 * day).toISOString().slice(0, 10);
  const facts = [
    { id: 1, status: 'READY_FOR_QUOTE', sold_at: new Date(Date.now() - 5 * day), ship_by_date: new Date(Date.now() - day), invoice_count: 0, uf: 'SP', region: 'Sudeste', shipment_id: null, contracted: null, paid: null, shipping_amount: null },
    { id: 2, status: 'DISPATCHED', shipment_id: 's', shipment_status: 'IN_TRANSIT', sold_at: new Date(Date.now() - 6 * day), dispatched_at: new Date(Date.now() - 5 * day), estimated_delivery_date: past, uf: 'RS', region: 'Sul', shipping_amount: 40, contracted: 30, paid: 35, invoice_value: 1000, carrier_id: 'c1', carrier_name: 'X' },
    { id: 3, status: 'DELIVERED', shipment_id: 't', shipment_status: 'DELIVERED', sold_at: new Date(Date.now() - 6 * day), dispatched_at: new Date(Date.now() - 5 * day), delivered_at: new Date(), estimated_delivery_date: past, uf: 'RS', region: 'Sul', shipping_amount: 20, contracted: 25, paid: null, invoice_value: 500, carrier_id: 'c1', carrier_name: 'X' },
    { id: 4, status: 'EXCEPTION', shipment_id: 'u', shipment_status: 'EXCEPTION', exception_text: 'Mercadoria com avaria', sold_at: new Date(), uf: 'PR', region: 'Sul', contracted: null, paid: null, shipping_amount: null }
  ];
  const t = controlTower(facts, 2);
  assert.equal(t.counts.total, 4);
  assert.equal(t.counts.aguardando_envio, 1);
  assert.equal(t.counts.expedicao_atrasada, 1);
  assert.equal(t.counts.sem_nf, 1);
  assert.equal(t.counts.em_andamento, 1);
  assert.equal(t.counts.entregues, 1);
  assert.equal(t.counts.atraso_transporte_abertos, 1);
  assert.equal(t.counts.atraso_transporte_entregues, 1);
  assert.equal(t.counts.avaria, 1);
  assert.equal(t.counts.pendencias, 2);

  const fin = financial(facts);
  assert.equal(fin.totals.sales.orders, 3); // pedido sem embarque/cotação fica fora
  assert.equal(fin.totals.sales.charged, 60);
  assert.equal(fin.totals.sales.cost, 55);
  assert.equal(fin.totals.audited.orders, 1);
  assert.equal(fin.totals.audited.paid, 35);
  assert.equal(fin.totals.audited.difference, 5);
}
