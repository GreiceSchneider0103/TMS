import assert from 'node:assert/strict';
import {
  validateRoutes,
  validateRecipientFees,
  validateRangeValueSheet,
  validateModal,
  validateGris,
  validateRestriction
} from '../src/services/freightTableValidation.js';

export function runFreightValidationTests() {
  const errors = [];
  validateRoutes([{ 'CEP inicial': '90000000', 'CEP final': '99999999', 'Peso inicial': 0, 'Peso final': 10 }], errors);
  assert.equal(errors.length, 0);

  const bad = [];
  validateRoutes([{ 'CEP inicial': 'abc', 'CEP final': '123', 'Peso inicial': 10, 'Peso final': 1 }], bad);
  assert.ok(bad.length >= 3);

  const r = [];
  validateRecipientFees([{ Documento: '' }], r);
  assert.equal(r.length, 2);

  const t = [];
  validateRangeValueSheet('TRT', [{ Faixa: '', Valor: 'x' }], t);
  assert.equal(t.length, 2);

  const m = [];
  validateModal([{ Região: '', Modal: '' }], m);
  assert.equal(m.length, 2);

  const g = [];
  validateGris([{ 'GRIS %': 'x' }], g);
  assert.equal(g.length, 1);

  const re = [];
  validateRestriction([{ Regra: '' }], re);
  assert.equal(re.length, 2);
}
