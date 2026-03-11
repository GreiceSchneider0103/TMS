export function validateRoutes(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!isCep(r['CEP inicial'])) errors.push({ sheet: 'Rotas', linha: line, campo: 'CEP inicial', erro: 'valor inválido' });
    if (!isCep(r['CEP final'])) errors.push({ sheet: 'Rotas', linha: line, campo: 'CEP final', erro: 'valor inválido' });
    if (Number(r['Peso final']) < Number(r['Peso inicial'])) errors.push({ sheet: 'Rotas', linha: line, campo: 'Peso final', erro: 'menor que peso inicial' });
  });
}

export function validateRecipientFees(rows, errors) {
  rows.forEach((r, idx) => {
    if (!r.Documento) errors.push({ sheet: 'Taxas por destinatário', linha: idx + 2, campo: 'Documento', erro: 'obrigatório' });
  });
}

export function validateRangeValueSheet(sheet, rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!r['Faixa']) errors.push({ sheet, linha: line, campo: 'Faixa', erro: 'obrigatório' });
    if (Number.isNaN(Number(r['Valor']))) errors.push({ sheet, linha: line, campo: 'Valor', erro: 'valor inválido' });
  });
}

export function validateModal(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!r['Região']) errors.push({ sheet: 'MODAL', linha: line, campo: 'Região', erro: 'obrigatório' });
    if (!r['Modal']) errors.push({ sheet: 'MODAL', linha: line, campo: 'Modal', erro: 'obrigatório' });
  });
}

export function validateGris(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (Number.isNaN(Number(r['GRIS %']))) errors.push({ sheet: 'GRIS-ADV', linha: line, campo: 'GRIS %', erro: 'valor inválido' });
  });
}

export function validateRestriction(rows, errors) {
  rows.forEach((r, idx) => {
    const line = idx + 2;
    if (!r['Regra']) errors.push({ sheet: 'Restrição de entrega', linha: line, campo: 'Regra', erro: 'obrigatório' });
  });
}

function isCep(v) {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length === 8;
}
