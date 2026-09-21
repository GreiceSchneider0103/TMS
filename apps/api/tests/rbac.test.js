import assert from 'node:assert/strict';
import { authorizeRole, normalizeRole } from '../src/utils/rbac.js';

export function runRbacTests() {
  assert.equal(normalizeRole('integracao'), 'analista_integracao');
  assert.equal(normalizeRole('OPERADOR'), 'operador_logistico');
  assert.equal(authorizeRole('admin', ['visualizador']), 'admin');
  assert.equal(authorizeRole('operador_logistico', ['operador_logistico']), 'operador_logistico');

  let forbidden = false;
  try {
    authorizeRole('visualizador', ['operador_logistico']);
  } catch (e) {
    forbidden = e.status === 403;
  }
  assert.equal(forbidden, true);
}
