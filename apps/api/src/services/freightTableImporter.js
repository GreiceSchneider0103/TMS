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
    cep_start: normalizeCep(r['CEP inicial']),
    cep_end: normalizeCep(r['CEP final']),
    min_weight: toNumber(r['Peso inicial']),
    max_weight: toNumber(r['Peso final']),
    base_amount: toNumber(r['Valor base']),
    extra_per_kg: toNumber(r['Excedente']),
    min_freight: toNumber(r['Frete mínimo']),
    ad_valorem_pct: toNumber(r['Ad valorem %']),
    gris_pct: toNumber(r['GRIS %']),
    trt_amount: toNumber(r.TRT),
    tda_amount: toNumber(r.TDA),
    cubing_factor: toNumber(r['Fator cubagem'] || 300),
    sla_days: Math.max(0, Math.floor(toNumber(r.Prazo || 7))),
    state: r.UF ? String(r.UF).trim().toUpperCase() : null,
    city: r.Cidade ? String(r.Cidade).trim() : null
  }));

  const recipientFees = recipientRows.map((r, idx) => ({
    line: idx + 2,
    recipient_document: normalizeDocument(r.Documento),
    fee_type: String(r['Tipo taxa'] || 'custom_fee').trim().toLowerCase(),
    amount: toNumber(r.Valor)
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

function normalizeCep(v) {
  return String(v || '').replace(/\D/g, '').padStart(8, '0').slice(-8);
}

function normalizeDocument(v) {
  return String(v || '').replace(/\D/g, '');
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
