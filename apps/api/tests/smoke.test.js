import assert from 'node:assert/strict';
import { applyShippingRules } from '../src/services/rulesEngine.js';

const out = applyShippingRules(
  [{ carrierId: '1', totalAmount: 100, totalDays: 5 }],
  [{ active: true, priority: 1, conditions: {}, actions: { discount_percent: 10 }, name: 'r1' }],
  { invoiceAmount: 1000 }
);
assert.equal(out[0].totalAmount, 90);
console.log('ok');
