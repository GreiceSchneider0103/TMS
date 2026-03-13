import assert from 'node:assert/strict';
import { TinyClient } from '../src/services/tinyClient.js';

export function runTinyClientTests() {
  const tiny = new TinyClient();

  const p1 = { orders: [{ id: '1', total: '1.234,56', numero: 'A1' }] };
  assert.equal(tiny.extractOrders(p1).length, 1);
  const n1 = tiny.normalizeOrder(tiny.extractOrders(p1)[0]);
  assert.equal(n1.id, '1');
  assert.equal(n1.number, 'A1');
  assert.equal(n1.total, 1234.56);

  const p2 = { retorno: { pedidos: [{ pedido: { numero: 'X2', valor: '99,90' } }] } };
  assert.equal(tiny.extractOrders(p2).length, 1);
  const n2 = tiny.normalizeOrder(tiny.extractOrders(p2)[0]);
  assert.equal(n2.number, 'X2');
  assert.equal(n2.total, 99.9);

  const p3 = { retorno: { registros: { registro: [{ idPedido: 'T3', totalPedido: '10.00' }] } } };
  assert.equal(tiny.extractOrders(p3).length, 1);
  const n3 = tiny.normalizeOrder(tiny.extractOrders(p3)[0]);
  assert.equal(n3.id, 'T3');
}
