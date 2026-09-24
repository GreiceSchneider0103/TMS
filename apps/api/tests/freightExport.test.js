import assert from 'node:assert/strict';
import { computeExportRows, freightExportWorkbook } from '../src/services/freightExport.js';

const route = (o) => ({ carrier_id: 'A', carrier_name: 'Transp A', state: null, city: null, min_weight: 0, max_weight: 5000, base_amount: 10, extra_per_kg: 0, min_freight: 0, ad_valorem_pct: 0, gris_pct: 0, trt_amount: 0, tda_amount: 0, cubing_factor: 300, sla_days: 3, ...o });

export function runFreightExportTests() {
  const routes = [
    route({ cep_start: '01000000', cep_end: '19999999', min_weight: 0, max_weight: 1, base_amount: 15 }),
    route({ cep_start: '01000000', cep_end: '19999999', min_weight: 1.001, max_weight: 5, base_amount: 25 }),
    route({ carrier_id: 'B', carrier_name: 'Transp B', cep_start: '10000000', cep_end: '29999999', min_weight: 0, max_weight: 5, base_amount: 12, sla_days: 5 }),
    route({ cep_start: '80000000', cep_end: '99999999', min_weight: 0, max_weight: 5, base_amount: 30, ad_valorem_pct: 1 })
  ];
  const out = computeExportRows(routes, [], { invoiceValue: 200 });
  assert.deepEqual(out.bands, [1, 5]); // faixas automáticas = pesos máximos das tabelas
  const find = (cep, kg) => out.rows.find((r) => r.cepStart <= cep && r.cepEnd >= cep && r.minKg <= kg && r.maxKg >= kg);
  assert.equal(find(1310100, 1).amount, 15);            // SP só A até 09999999
  assert.equal(find(15000000, 1).amount, 12);           // 10-19M: B (12) é mais barata que A (15)
  assert.equal(find(15000000, 1).carrier, 'Transp B');
  assert.equal(find(15000000, 3).amount, 12);           // 1-5 kg: B (12) x A (25)
  assert.equal(find(25000000, 3).carrier, 'Transp B');  // RJ só B
  assert.equal(find(90000000, 3).amount, 32);           // RS: 30 + 1% de 200
  assert.equal(find(90000000, 3).uf, 'RS');             // segmentos cortados na divisa: 90M+ é RS
  assert.equal(find(85000000, 3).uf, 'PR');
  assert.equal(find(88000000, 3).uf, 'SC');
  assert.equal(find(40000000, 1), undefined);           // sem cobertura

  // Regra do canal: 10% de desconto no Sul para a Shopee
  const rules = [{ name: 'sul', active: true, priority: 1, conditions: { states: ['PR', 'SC', 'RS'], channels: ['shopee'] }, actions: { discount_percent: 10 } }];
  const shopee = computeExportRows(routes, rules, { channel: 'shopee', invoiceValue: 200 });
  const s = shopee.rows.find((r) => r.cepStart <= 90000000 && r.cepEnd >= 90000000 && r.maxKg === 5);
  assert.equal(s.amount, 28.8);

  const buf = freightExportWorkbook(out, { invoiceValue: 200 });
  assert.ok(buf.length > 1000);
}
