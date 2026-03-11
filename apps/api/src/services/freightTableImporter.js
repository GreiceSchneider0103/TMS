import XLSX from 'xlsx';

const REQUIRED = {
  'Configurações': ['Versão', 'Remetente'],
  'Tipo de carga': ['Tipo', 'Ativo'],
  Rotas: ['CEP inicial', 'CEP final', 'Peso inicial', 'Peso final', 'Valor base'],
  'Taxas por destinatário': ['Documento', 'Tipo taxa', 'Valor'],
  TRT: ['Faixa', 'Valor'],
  TDA: ['Faixa', 'Valor'],
  MODAL: ['Região', 'Modal'],
  'GRIS-ADV': ['Faixa', 'GRIS %'],
  'Restrição de entrega': ['Regra', 'Valor']
};

export function parseFreightXlsx(base64Content) {
  const workbook = XLSX.read(Buffer.from(base64Content, 'base64'), { type: 'buffer' });
  const errors = [];

  for (const [sheet, columns] of Object.entries(REQUIRED)) {
    const rows = toJson(workbook, sheet);
    if (!rows.length) {
      errors.push({ sheet, linha: null, campo: null, erro: 'Aba obrigatória ausente ou vazia' });
      continue;
    }
    for (const column of columns) {
      if (!(column in rows[0])) errors.push({ sheet, linha: 1, campo: column, erro: 'Coluna obrigatória ausente' });
    }
    if (sheet === 'Rotas') validateRoutes(rows, errors);
    if (sheet === 'Taxas por destinatário') validateRecipientFees(rows, errors);
if (sheet === 'TRT' || sheet === 'TDA') validateRangeValueSheet(sheet, rows, errors);
    if (sheet === 'MODAL') validateModal(rows, errors);
    if (sheet === 'GRIS-ADV') validateGris(rows, errors);
    if (sheet === 'Restrição de entrega') validateRestriction(rows, errors);
  }

  const routeRows = toJson(workbook, 'Rotas');
  const recipientRows = toJson(workbook, 'Taxas por destinatário');
  const routes = routeRows.map((r, idx) => ({
    line: idx + 2,
    cep_start: String(r['CEP inicial'] || ''),
    cep_end: String(r['CEP final'] || ''),
    min_weight: Number(r['Peso inicial'] || 0),
    max_weight: Number(r['Peso final'] || 0),
    base_amount: Number(r['Valor base'] || 0),
    extra_per_kg: Number(r['Excedente'] || 0),
    min_freight: Number(r['Frete mínimo'] || 0),
    ad_valorem_pct: Number(r['Ad valorem %'] || 0),
    gris_pct: Number(r['GRIS %'] || 0),
    trt_amount: Number(r.TRT || 0),
    tda_amount: Number(r.TDA || 0),
    cubing_factor: Number(r['Fator cubagem'] || 300),
    sla_days: Number(r.Prazo || 7),
    state: r.UF || null,
    city: r.Cidade || null
  }));

  const recipientFees = recipientRows.map((r, idx) => ({
    line: idx + 2,
    recipient_document: String(r.Documento || ''),
    fee_type: String(r['Tipo taxa'] || 'custom_fee'),
    amount: Number(r.Valor || 0)
  }));

  return {
    ok: errors.length === 0,
    errors,
    preview: {
      rotas_detectadas: routes.length,
      taxas_detectadas: recipientFees.length,
      erros: errors,
      routes: routes.slice(0, 20),
      recipientFees: recipientFees.slice(0, 20)
    },
    normalized: { config: toJson(workbook, 'Configurações')[0] || {}, routes, recipientFees }
  };
}

function validateRoutes(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!isCep(r['CEP inicial'])) errors.push({ sheet: 'Rotas', linha: line, campo: 'CEP inicial', erro: 'valor inválido' });
    if (!isCep(r['CEP final'])) errors.push({ sheet: 'Rotas', linha: line, campo: 'CEP final', erro: 'valor inválido' });
    if (Number(r['Peso final']) < Number(r['Peso inicial'])) errors.push({ sheet: 'Rotas', linha: line, campo: 'Peso final', erro: 'menor que peso inicial' });
  });
}

function validateRecipientFees(rows, errors) {
  rows.forEach((r, idx) => {
    if (!r.Documento) errors.push({ sheet: 'Taxas por destinatário', linha: idx + 2, campo: 'Documento', erro: 'obrigatório' });
  });
}

function toJson(workbook, sheet) {
  const ws = workbook.Sheets[sheet];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function isCep(v) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length === 8;
}


function validateRangeValueSheet(sheet, rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!r['Faixa']) errors.push({ sheet, linha: line, campo: 'Faixa', erro: 'obrigatório' });
    if (Number.isNaN(Number(r['Valor']))) errors.push({ sheet, linha: line, campo: 'Valor', erro: 'valor inválido' });
  });
}

function validateModal(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!r['Região']) errors.push({ sheet: 'MODAL', linha: line, campo: 'Região', erro: 'obrigatório' });
    if (!r['Modal']) errors.push({ sheet: 'MODAL', linha: line, campo: 'Modal', erro: 'obrigatório' });
  });
}

function validateGris(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (Number.isNaN(Number(r['GRIS %']))) errors.push({ sheet: 'GRIS-ADV', linha: line, campo: 'GRIS %', erro: 'valor inválido' });
  });
}

function validateRestriction(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!r['Regra']) errors.push({ sheet: 'Restrição de entrega', linha: line, campo: 'Regra', erro: 'obrigatório' });
  });
}
