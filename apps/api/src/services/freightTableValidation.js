export function validateRoutes(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    const cepStart = String(r['CEP inicial'] || '').replace(/\D/g, '');
    const cepEnd = String(r['CEP final'] || '').replace(/\D/g, '');
    const minWeight = toNumber(r['Peso inicial']);
    const maxWeight = toNumber(r['Peso final']);
    const baseAmount = toNumber(r['Valor base']);

    if (!isCep(cepStart)) errors.push({ sheet: 'Rotas', linha: line, campo: 'CEP inicial', erro: 'CEP deve ter 8 dígitos' });
    if (!isCep(cepEnd)) errors.push({ sheet: 'Rotas', linha: line, campo: 'CEP final', erro: 'CEP deve ter 8 dígitos' });
    if (maxWeight < minWeight) errors.push({ sheet: 'Rotas', linha: line, campo: 'Peso final', erro: 'não pode ser menor que Peso inicial' });
    if (baseAmount <= 0) errors.push({ sheet: 'Rotas', linha: line, campo: 'Valor base', erro: 'deve ser maior que zero' });
  });
}

export function validateRecipientFees(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    const doc = String(r.Documento || '').replace(/\D/g, '');
    if (!(doc.length === 11 || doc.length === 14)) errors.push({ sheet: 'Taxas por destinatário', linha: line, campo: 'Documento', erro: 'deve conter 11 (CPF) ou 14 (CNPJ) dígitos' });
    if (!String(r['Tipo taxa'] || '').trim()) errors.push({ sheet: 'Taxas por destinatário', linha: line, campo: 'Tipo taxa', erro: 'obrigatório' });
    if (toNumber(r.Valor) < 0) errors.push({ sheet: 'Taxas por destinatário', linha: line, campo: 'Valor', erro: 'não pode ser negativo' });
  });
}

export function validateRangeValueSheet(sheet, rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!String(r['Faixa'] || '').trim()) errors.push({ sheet, linha: line, campo: 'Faixa', erro: 'obrigatório' });
    if (isInvalidNumberish(r['Valor'])) errors.push({ sheet, linha: line, campo: 'Valor', erro: 'valor inválido' });
  });
}

export function validateModal(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!String(r['Região'] || '').trim()) errors.push({ sheet: 'MODAL', linha: line, campo: 'Região', erro: 'obrigatório' });
    if (!String(r['Modal'] || '').trim()) errors.push({ sheet: 'MODAL', linha: line, campo: 'Modal', erro: 'obrigatório' });
  });
}

export function validateGris(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (isInvalidNumberish(r['GRIS %'])) {
      errors.push({ sheet: 'GRIS-ADV', linha: line, campo: 'GRIS %', erro: 'valor inválido' });
      return;
    }
    const gris = toNumber(r['GRIS %']);
    if (gris < 0) errors.push({ sheet: 'GRIS-ADV', linha: line, campo: 'GRIS %', erro: 'não pode ser negativo' });
  });
}

export function validateRestriction(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!String(r['Regra'] || '').trim()) errors.push({ sheet: 'Restrição de entrega', linha: line, campo: 'Regra', erro: 'obrigatório' });
    if (!String(r['Valor'] || '').trim()) errors.push({ sheet: 'Restrição de entrega', linha: line, campo: 'Valor', erro: 'obrigatório' });
  });
}

function isCep(v) {
  return String(v || '').replace(/\D/g, '').length === 8;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  if (typeof value === 'number') return value;
  return Number(String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
}

function isInvalidNumberish(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return true;
  const parsed = Number(normalized);
  return !Number.isFinite(parsed);
}
