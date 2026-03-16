import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { buildFreightWorkbookCompatibilityReport } from '../src/services/freightWorkbookCompatibility.js';

function workbookBase64(sheetNames) {
  const wb = XLSX.utils.book_new();
  for (const name of sheetNames) {
    const ws = XLSX.utils.aoa_to_sheet([['header'], ['value']]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer.toString('base64');
}

export function runFreightWorkbookCompatibilityTests() {
  const missingReport = buildFreightWorkbookCompatibilityReport(workbookBase64(['Configurações']));
  const missingRotas = missingReport.sheets.find((s) => s.sheet === 'Rotas');
  assert.equal(missingRotas.status, 'incompatível');

  const completeReport = buildFreightWorkbookCompatibilityReport(
    workbookBase64(['Configurações', 'Tipo de carga', 'Rotas', 'Taxas por destinatário', 'TRT', 'TDA', 'MODAL', 'GRIS-ADV', 'Restrição de entrega'])
  );
  const rotas = completeReport.sheets.find((s) => s.sheet === 'Rotas');
  assert.equal(rotas.status, 'parcial');
  assert.ok(rotas.errorCount > 0);
}
