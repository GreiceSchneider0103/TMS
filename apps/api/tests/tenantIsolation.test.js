import assert from 'node:assert/strict';
import { filterByTenant } from '../src/utils/tenantIsolation.js';

export function runTenantIsolationTests() {
  const rows = [
    { id: 1, account_id: 'A' },
    { id: 2, account_id: 'B' },
    { id: 3, account_id: 'A' }
  ];
  const a = filterByTenant(rows, 'A');
  const b = filterByTenant(rows, 'B');
  assert.deepEqual(a.map((x) => x.id), [1, 3]);
  assert.deepEqual(b.map((x) => x.id), [2]);
}
