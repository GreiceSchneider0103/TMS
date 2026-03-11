import assert from 'node:assert/strict';
import { computeBackoffMs, isDeadLetter } from '../../../workers/src/retryPolicy.js';

export function runWorkerPolicyTests() {
  const b1 = computeBackoffMs(1);
  const b2 = computeBackoffMs(2);
  assert.ok(b2 >= b1);
  assert.equal(isDeadLetter(7), false);
  assert.equal(isDeadLetter(8), true);
}
