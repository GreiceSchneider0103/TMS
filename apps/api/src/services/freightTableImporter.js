import XLSX from 'xlsx';
import {
  validateRoutes,
  validateRecipientFees,
  validateRangeValueSheet,
  validateModal,
  validateGris,
  validateRestriction
} from './freightTableValidation.js';

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

const FIELD_SYNONYMS = {
  cepStart: ['CEP inicial', 'CEP Inicial', 'CEP Origem Inicial'],
  cepEnd: ['CEP final', 'CEP Final', 'CEP Origem Final'],
  minWeight: ['Peso inicial', 'Peso Inicial'],
  maxWeight: ['Peso final', 'Peso Final'],
  baseAmount: ['Valor base', 'Tarifa Base'],
  extraPerKg: ['Excedente', 'Valor excedente', 'Excedente/kg'],
  minFreight: ['Frete mínimo', 'Frete Minimo', 'Valor mínimo frete'],
  adValorem: ['Ad valorem %', 'ADV %', 'Ad Valorem %'],
  grisPct: ['GRIS %', 'GRIS', 'GRIS-ADV %'],
  trt: ['TRT'],
  tda: ['TDA'],
  cubingFactor: ['Fator cubagem', 'Fator de cubagem'],
  prazo: ['Prazo', 'Prazo (dias)', 'SLA'],
  uf: ['UF', 'Estado'],
  cidade: ['Cidade', 'Município'],
  recipientDocument: ['Documento', 'CPF/CNPJ'],
  feeType: ['Tipo taxa', 'Tipo de taxa'],
  feeValue: ['Valor', 'Valor taxa']
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
    cep_start: normalizeCep(pick(r, FIELD_SYNONYMS.cepStart)),
    cep_end: normalizeCep(pick(r, FIELD_SYNONYMS.cepEnd)),
    min_weight: toNumber(pick(r, FIELD_SYNONYMS.minWeight)),
    max_weight: toNumber(pick(r, FIELD_SYNONYMS.maxWeight)),
    base_amount: toNumber(pick(r, FIELD_SYNONYMS.baseAmount)),
    extra_per_kg: toNumber(pick(r, FIELD_SYNONYMS.extraPerKg)),
    min_freight: toNumber(pick(r, FIELD_SYNONYMS.minFreight)),
    ad_valorem_pct: toNumber(pick(r, FIELD_SYNONYMS.adValorem)),
    gris_pct: toNumber(pick(r, FIELD_SYNONYMS.grisPct)),
    trt_amount: toNumber(pick(r, FIELD_SYNONYMS.trt)),
    tda_amount: toNumber(pick(r, FIELD_SYNONYMS.tda)),
    cubing_factor: toNumber(pick(r, FIELD_SYNONYMS.cubingFactor, 300)),
    sla_days: Math.max(0, Math.floor(toNumber(pick(r, FIELD_SYNONYMS.prazo, 7)))),
    state: pick(r, FIELD_SYNONYMS.uf) ? String(pick(r, FIELD_SYNONYMS.uf)).trim().toUpperCase() : null,
    city: pick(r, FIELD_SYNONYMS.cidade) ? String(pick(r, FIELD_SYNONYMS.cidade)).trim() : null
  }));

  const recipientFees = recipientRows.map((r, idx) => ({
    line: idx + 2,
    recipient_document: normalizeDocument(pick(r, FIELD_SYNONYMS.recipientDocument)),
    fee_type: String(pick(r, FIELD_SYNONYMS.feeType, 'custom_fee') || 'custom_fee').trim().toLowerCase(),
    amount: toNumber(pick(r, FIELD_SYNONYMS.feeValue))
  }));

  return {
    ok: errors.length === 0,
    errors,
    preview: {
      counts: {
        rotas_detectadas: routes.length,
        taxas_detectadas: recipientFees.length,
        erros_detectados: errors.length
      },
      errors,
      routes: routes.slice(0, 20),
      recipientFees: recipientFees.slice(0, 20)
    },
    normalized: { config: toJson(workbook, 'Configurações')[0] || {}, routes, recipientFees }
  };
}

function toJson(workbook, sheet) {
  const ws = workbook.Sheets[sheet];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function pick(row, keys, fallback = null) {
  for (const key of keys || []) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return fallback;
}

function normalizeCep(v) {
  return String(v || '').replace(/\D/g, '').padStart(8, '0').slice(-8);
}

function normalizeDocument(v) {
  return String(v || '').replace(/\D/g, '');
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value).trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!raw) return 0;

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');

  let normalized = raw;
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
