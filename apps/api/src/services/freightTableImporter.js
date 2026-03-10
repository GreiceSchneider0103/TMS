import XLSX from 'xlsx';

const REQUIRED_SHEETS = ['Configurações', 'Tipo de carga', 'Rotas', 'Taxas por destinatário', 'TRT', 'TDA', 'GRIS-ADV'];

export function parseFreightXlsx(base64Content) {
  const workbook = XLSX.read(Buffer.from(base64Content, 'base64'), { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  const errors = [];

  for (const sheet of REQUIRED_SHEETS) {
    if (!sheetNames.includes(sheet)) errors.push({ sheet, row: null, field: null, message: 'Aba obrigatória ausente' });
  }

  const configRows = toJson(workbook, 'Configurações');
  const routeRows = toJson(workbook, 'Rotas');
  const recipientRows = toJson(workbook, 'Taxas por destinatário');

  validateColumns(routeRows, ['CEP inicial', 'CEP final', 'Peso inicial', 'Peso final', 'Valor base'], 'Rotas', errors);

  const routes = routeRows.map((r, idx) => ({
    line: idx + 2,
    cep_start: r['CEP inicial'],
    cep_end: r['CEP final'],
    min_weight: Number(r['Peso inicial'] || 0),
    max_weight: Number(r['Peso final'] || 0),
    base_amount: Number(r['Valor base'] || 0),
    extra_per_kg: Number(r['Excedente'] || 0),
    min_freight: Number(r['Frete mínimo'] || 0),
    ad_valorem_pct: Number(r['Ad valorem %'] || 0),
    gris_pct: Number(r['GRIS %'] || 0),
    trt_amount: Number(r['TRT'] || 0),
    tda_amount: Number(r['TDA'] || 0),
    cubing_factor: Number(r['Fator cubagem'] || 300),
    sla_days: Number(r['Prazo'] || 7),
    state: r['UF'] || null,
    city: r['Cidade'] || null
  }));

  const recipientFees = recipientRows.map((r, idx) => ({
    line: idx + 2,
    recipient_document: String(r['Documento'] || ''),
    fee_type: String(r['Tipo taxa'] || 'custom_fee'),
    amount: Number(r['Valor'] || 0)
  }));

  return {
    ok: errors.length === 0,
    errors,
    preview: {
      config: configRows[0] || {},
      routes: routes.slice(0, 20),
      recipientFees: recipientFees.slice(0, 20),
      counts: { routes: routes.length, recipientFees: recipientFees.length }
    },
    normalized: { config: configRows[0] || {}, routes, recipientFees }
  };
}

function toJson(workbook, sheet) {
  const ws = workbook.Sheets[sheet];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function validateColumns(rows, requiredColumns, sheet, errors) {
  if (!rows.length) {
    errors.push({ sheet, row: null, field: null, message: 'Aba sem linhas' });
    return;
  }
  for (const column of requiredColumns) {
    if (!(column in rows[0])) errors.push({ sheet, row: 1, field: column, message: 'Coluna obrigatória ausente' });
  }
}
