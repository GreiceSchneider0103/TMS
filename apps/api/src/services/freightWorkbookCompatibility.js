import XLSX from 'xlsx';
import { parseFreightXlsx, REQUIRED_SHEETS } from './freightTableImporter.js';

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function countNonEmptyRows(sheet) {
  if (!sheet) return 0;
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  return matrix.filter((row) => Array.isArray(row) && row.some((cell) => clean(cell) !== '')).length;
}

export function buildFreightWorkbookCompatibilityReport(base64Content) {
  const workbook = XLSX.read(Buffer.from(base64Content, 'base64'), { type: 'buffer' });
  const parsed = parseFreightXlsx(base64Content);

  const errorsBySheet = parsed.errors.reduce((acc, err) => {
    const sheet = err.sheet || 'Desconhecida';
    acc[sheet] = (acc[sheet] || 0) + 1;
    return acc;
  }, {});

  const sheets = REQUIRED_SHEETS.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rowCount = countNonEmptyRows(sheet);
    const errors = errorsBySheet[sheetName] || 0;
    const missing = !sheet;

    let status = 'compatível';
    if (missing) status = 'incompatível';
    else if (errors > 0 && rowCount > 0) status = 'parcial';
    else if (errors > 0) status = 'incompatível';

    return {
      sheet: sheetName,
      status,
      rowCount,
      errorCount: errors
    };
  });

  return {
    ok: parsed.ok,
    totalErrors: parsed.errors.length,
    sheets,
    errors: parsed.errors
  };
}
