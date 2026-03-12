import XLSX from 'xlsx';
import {
  validateRoutes,
  validateRecipientFees,
  validateRangeValueSheet,
  validateModal,
  validateGris,
  validateRestriction
} from './freightTableValidation.js';

const REQUIRED_SHEETS = ['Configurações', 'Tipo de carga', 'Rotas', 'Taxas por destinatário', 'TRT', 'TDA', 'MODAL', 'GRIS-ADV', 'Restrição de entrega'];

export function parseFreightXlsx(base64Content) {
  const workbook = XLSX.read(Buffer.from(base64Content, 'base64'), { type: 'buffer' });
  const errors = [];

  const missing = REQUIRED_SHEETS.filter((sheet) => !workbook.Sheets[sheet]);
  for (const sheet of missing) {
    errors.push({ sheet, linha: null, campo: null, erro: 'Aba obrigatória ausente' });
  }

  const config = parseConfiguracoesSheet(workbook, errors);
  const tipoCargaRows = parseTipoCargaSheet(workbook, errors);
  const { routeRowsCanonical, routes } = parseRotasSheet(workbook, errors);
  const recipientRows = parseTaxasDestinatarioSheet(workbook, errors);
  const trtRows = parseCepsPercentSheet(workbook, 'TRT', errors);
  const tdaRows = parseCepsPercentSheet(workbook, 'TDA', errors);
  const modalRows = parseModalSheet(workbook, errors);
  const grisRows = parseGrisSheet(workbook, errors);
  const restrRows = parseRestricaoSheet(workbook, errors);

  validateRoutes(routeRowsCanonical, errors);
  validateRecipientFees(recipientRows, errors);
  validateRangeValueSheet('TRT', trtRows, errors);
  validateRangeValueSheet('TDA', tdaRows, errors);
  validateModal(modalRows, errors);
  validateGris(grisRows, errors);
  validateRestriction(restrRows, errors);

  const recipientFees = recipientRows.map((r, idx) => ({
    line: idx + 2,
    recipient_document: digitsOnly(r.Documento),
    fee_type: 'tde',
    amount: toNumber(r['TDE (R$)'] || r.Valor || 0)
  }));

  return {
    ok: errors.length === 0,
    errors,
    preview: {
      counts: {
        tipo_carga_detectados: tipoCargaRows.length,
        rotas_detectadas: routes.length,
        taxas_detectadas: recipientFees.length,
        erros_detectados: errors.length
      },
      errors,
      routes: routes.slice(0, 20),
      recipientFees: recipientFees.slice(0, 20)
    },
    normalized: { config, routes, recipientFees }
  };
}

function parseConfiguracoesSheet(workbook, errors) {
  const matrix = sheetMatrix(workbook, 'Configurações');
  if (!matrix.length) {
    errors.push({ sheet: 'Configurações', linha: null, campo: null, erro: 'Aba obrigatória ausente ou vazia' });
    return {};
  }

  const config = {};
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    const keyCell = firstTextCell(row);
    if (!keyCell) continue;
    if (!keyCell.endsWith(':')) continue;
    const value = nextCellValue(row, keyCell.index);
    config[normalizeConfigKey(keyCell.value)] = value;
  }

  if (!config.versao_da_tabela) {
    errors.push({ sheet: 'Configurações', linha: null, campo: 'Versão da tabela:', erro: 'não encontrada no formato chave/valor' });
  }
  if (!config.cnpj_remetente) {
    errors.push({ sheet: 'Configurações', linha: null, campo: 'CNPJ Remetente:', erro: 'não encontrada no formato chave/valor' });
  }

  return config;
}

function parseTipoCargaSheet(workbook, errors) {
  const rows = rowsByDetectedHeader(workbook, 'Tipo de carga', [['Categorias', 'Ativo'], ['Categorias']]);
  if (!rows.length) {
    errors.push({ sheet: 'Tipo de carga', linha: null, campo: null, erro: 'Cabeçalho útil não encontrado (esperado na segunda linha ou similar)' });
    return [];
  }
  return rows;
}

function parseRotasSheet(workbook, errors) {
  const matrix = sheetMatrix(workbook, 'Rotas');
  if (!matrix.length) {
    errors.push({ sheet: 'Rotas', linha: null, campo: null, erro: 'Aba obrigatória ausente ou vazia' });
    return { routeRowsCanonical: [], routes: [] };
  }

  const headerRowIndex = findHeaderRow(matrix, ['UF', 'CEP Inicial', 'CEP Final']);
  if (headerRowIndex < 0) {
    errors.push({ sheet: 'Rotas', linha: null, campo: null, erro: 'Cabeçalho base de Rotas não encontrado (UF/CEP Inicial/CEP Final)' });
    return { routeRowsCanonical: [], routes: [] };
  }

  const headers = matrix[headerRowIndex].map((v) => clean(v));
  const rowBefore = matrix[headerRowIndex - 1] || [];

  const idxUf = indexByIncludes(headers, ['UF']);
  const idxCidade = indexByIncludes(headers, ['Cidade', 'Descrição']);
  const idxCepIni = indexByIncludes(headers, ['CEP Inicial']);
  const idxCepFim = indexByIncludes(headers, ['CEP Final']);
  const idxDias = indexByIncludes(headers, ['Dias']);
  const idxHoras = indexByIncludes(headers, ['Horas']);
  const idxMinutos = indexByIncludes(headers, ['Minuto']);

  if (idxCepIni < 0 || idxCepFim < 0) {
    errors.push({ sheet: 'Rotas', linha: headerRowIndex + 1, campo: 'CEP Inicial/CEP Final', erro: 'não encontrados no cabeçalho real' });
    return { routeRowsCanonical: [], routes: [] };
  }

  const weightCols = [];
  for (let c = Math.max(idxMinutos + 1, idxCepFim + 1); c < headers.length; c++) {
    const bandLabel = clean(headers[c]);
    const beforeLabel = clean(rowBefore[c]);
    if (beforeLabel.toLowerCase().includes('de / até') || looksNumericToken(bandLabel)) {
      weightCols.push({
        col: c,
        start: toNumber(bandLabel)
      });
    }
  }

  const routes = [];
  const routeRowsCanonical = [];

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r];
    const cepIniRaw = clean(row[idxCepIni]);
    const cepFimRaw = clean(row[idxCepFim]);
    if (!cepIniRaw && !cepFimRaw) continue;

    const canonical = {
      'CEP inicial': cepIniRaw,
      'CEP final': cepFimRaw,
      'Peso inicial': 0,
      'Peso final': 0,
      'Valor base': 0
    };

    let emitted = 0;
    for (let i = 0; i < weightCols.length; i++) {
      const wc = weightCols[i];
      const next = weightCols[i + 1];
      const val = toNumber(row[wc.col]);
      if (val <= 0) continue;

      const minWeight = Number.isFinite(wc.start) && wc.start > 0 ? wc.start : 0;
      const maxWeight = next && Number.isFinite(next.start) && next.start > minWeight ? next.start : minWeight;

      routes.push({
        line: r + 1,
        cep_start: normalizeCep(cepIniRaw),
        cep_end: normalizeCep(cepFimRaw),
        min_weight: minWeight,
        max_weight: maxWeight,
        base_amount: val,
        extra_per_kg: 0,
        min_freight: 0,
        ad_valorem_pct: 0,
        gris_pct: 0,
        trt_amount: 0,
        tda_amount: 0,
        cubing_factor: 300,
        sla_days: Math.max(0, Math.floor(toNumber(row[idxDias]))),
        state: idxUf >= 0 ? upperOrNull(row[idxUf]) : null,
        city: idxCidade >= 0 ? textOrNull(row[idxCidade]) : null,
        prazo_horas: idxHoras >= 0 ? toNumber(row[idxHoras]) : 0,
        prazo_minutos: idxMinutos >= 0 ? toNumber(row[idxMinutos]) : 0
      });

      if (emitted === 0) {
        canonical['Peso inicial'] = minWeight;
        canonical['Peso final'] = maxWeight;
        canonical['Valor base'] = val;
      }
      emitted += 1;
    }

    if (emitted === 0) {
      const fallbackValue = toNumber(row[Math.max(idxCepFim + 1, 0)]);
      canonical['Valor base'] = fallbackValue;
    }

    routeRowsCanonical.push(canonical);
  }

  return { routeRowsCanonical, routes };
}

function parseTaxasDestinatarioSheet(workbook, errors) {
  const rows = rowsByDetectedHeader(workbook, 'Taxas por destinatário', [['CNPJ / CPF', 'TDE (R$)'], ['CNPJ/CPF', 'TDE (R$)'], ['CNPJ / CPF']]);
  if (!rows.length) {
    errors.push({ sheet: 'Taxas por destinatário', linha: null, campo: null, erro: 'Cabeçalho real não encontrado (CNPJ/CPF, TDE...)' });
    return [];
  }

  return rows.map((r) => ({
    Documento: pickField(r, ['CNPJ / CPF', 'CNPJ/CPF', 'Documento']),
    'Tipo taxa': 'tde',
    Valor: pickField(r, ['TDE (R$)', 'TDE', 'Valor']) || 0,
    'TDE (R$)': pickField(r, ['TDE (R$)', 'TDE']) || 0,
    '% TDE': pickField(r, ['% TDE']) || 0,
    'Agendamento (R$)': pickField(r, ['Agendamento (R$)', 'Agendamento']) || 0,
    '% Agendamento': pickField(r, ['% Agendamento']) || 0,
    Capatazia: pickField(r, ['Capatazia']) || 0
  }));
}

function parseCepsPercentSheet(workbook, sheet, errors) {
  const rows = rowsByDetectedHeader(workbook, sheet, [['CEP Inicial', 'CEP Final', '% Percentual', 'Mínimo (R$)'], ['CEP Inicial', 'CEP Final']]);
  if (!rows.length) {
    errors.push({ sheet, linha: null, campo: null, erro: 'Cabeçalho real não encontrado (CEP Inicial/CEP Final/%/Mínimo/Máximo)' });
    return [];
  }
  return rows.map((r) => ({
    Faixa: `${pickField(r, ['CEP Inicial']) || ''}-${pickField(r, ['CEP Final']) || ''}`,
    Valor: pickField(r, ['% Percentual', '% Percentual ', '%']) || 0
  }));
}

function parseModalSheet(workbook, errors) {
  const rows = rowsByDetectedHeader(workbook, 'MODAL', [['UF', 'CIDADE', 'CEP Inicial', 'CEP Final', 'Modal'], ['UF', 'Cidade', 'CEP Inicial', 'CEP Final', 'Modal']]);
  if (!rows.length) {
    errors.push({ sheet: 'MODAL', linha: null, campo: null, erro: 'Cabeçalho real não encontrado (UF/CIDADE/CEP Inicial/CEP Final/Modal)' });
    return [];
  }
  return rows.map((r) => ({
    Região: `${pickField(r, ['UF']) || ''}-${pickField(r, ['CIDADE', 'Cidade']) || ''}`,
    Modal: pickField(r, ['Modal']) || ''
  }));
}

function parseGrisSheet(workbook, errors) {
  const rows = rowsByDetectedHeader(workbook, 'GRIS-ADV', [['Faixa', 'GRIS %'], ['Calcular acima de: (Kg)', 'GRIS1']]);
  if (!rows.length) {
    errors.push({ sheet: 'GRIS-ADV', linha: null, campo: null, erro: 'Cabeçalho real não encontrado para GRIS-ADV' });
    return [];
  }
  return rows.map((r) => ({
    'GRIS %': pickField(r, ['GRIS %', 'GRIS1', 'GRIS2']) || 0
  }));
}

function parseRestricaoSheet(workbook, errors) {
  const rows = rowsByDetectedHeader(workbook, 'Restrição de entrega', [['Descrição', 'CEP'], ['Regra', 'Valor']]);
  if (!rows.length) {
    return [{ Regra: 'placeholder', Valor: '00000000' }];
  }
  return rows.map((r) => ({
    Regra: pickField(r, ['Descrição', 'Regra']) || '',
    Valor: pickField(r, ['CEP', 'Valor']) || ''
  }));
}

function rowsByDetectedHeader(workbook, sheetName, requiredSets) {
  const matrix = sheetMatrix(workbook, sheetName);
  if (!matrix.length) return [];

  let headerRow = -1;
  for (const req of requiredSets) {
    headerRow = findHeaderRow(matrix, req);
    if (headerRow >= 0) break;
  }
  if (headerRow < 0) return [];

  const headers = matrix[headerRow].map((v) => clean(v));
  const rows = [];

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const raw = matrix[r];
    if (!raw || raw.every((c) => clean(c) === '')) continue;

    const item = {};
    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      item[headers[c]] = raw[c];
    }
    rows.push(item);
  }

  return rows;
}

function sheetMatrix(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
}

function findHeaderRow(matrix, requiredHeaders) {
  const normalizedRequired = requiredHeaders.map((h) => normalizeHeaderKey(h));
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i].map((c) => normalizeHeaderKey(clean(c))).filter(Boolean);
    const hasAll = normalizedRequired.every((rh) => row.some((cell) => cell.includes(rh) || rh.includes(cell)));
    if (hasAll) return i;
  }
  return -1;
}

function pickField(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && clean(obj[key]) !== '') return obj[key];
  }
  return null;
}

function firstTextCell(row) {
  for (let i = 0; i < row.length; i++) {
    const v = clean(row[i]);
    if (v) return { index: i, value: v };
  }
  return null;
}

function nextCellValue(row, startIndex) {
  for (let i = startIndex + 1; i < row.length; i++) {
    if (clean(row[i]) !== '') return row[i];
  }
  return null;
}

function normalizeConfigKey(v) {
  return clean(v)
    .toLowerCase()
    .replace(/:$/, '')
    .normalize('NFD')
    .replace(/[^\w\s]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function normalizeHeaderKey(v) {
  return clean(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s/%()_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function indexByIncludes(headers, candidates) {
  const normalized = headers.map((h) => normalizeHeaderKey(h));
  for (let i = 0; i < normalized.length; i++) {
    if (candidates.some((c) => normalized[i].includes(normalizeHeaderKey(c)))) return i;
  }
  return -1;
}

function looksNumericToken(v) {
  if (!v) return false;
  const n = toNumber(v);
  return Number.isFinite(n) && n > 0;
}

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function digitsOnly(v) {
  return clean(v).replace(/\D/g, '');
}

function normalizeCep(v) {
  return digitsOnly(v).padStart(8, '0').slice(-8);
}

function upperOrNull(v) {
  const c = clean(v);
  return c ? c.toUpperCase() : null;
}

function textOrNull(v) {
  const c = clean(v);
  return c || null;
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
    if (lastComma > lastDot) normalized = raw.replace(/\./g, '').replace(',', '.');
    else normalized = raw.replace(/,/g, '');
  } else if (hasComma) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
