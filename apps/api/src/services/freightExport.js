import XLSX from 'xlsx';
import { query } from '../db.js';
import { calculateRouteQuote } from './freightEngine.js';
import { applyShippingRules } from './rulesEngine.js';
import { cepToUf, CEP_RANGES } from './analytics.js';

// Exporta as tabelas publicadas (já com as regras de frete do canal) como uma tabela estática
// CEP inicial x CEP final x faixa de peso -> valor e prazo, para subir em plataformas que só aceitam planilha.

const MAX_ROWS = 400000;
const AUTO_BANDS_LIMIT = 60;
const DEFAULT_BANDS = [0.3, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 75, 100];

const pad8 = (v) => String(v || '').replace(/\D/g, '').padStart(8, '0').slice(-8);
const cepNum = (v) => Number(pad8(v));
const fmtCep = (n) => String(n).padStart(8, '0');

export async function buildFreightExport(accountId, opts = {}) {
  const channel = opts.channel || null;
  const invoiceValue = Math.max(0, Number(opts.invoiceValue) || 0);
  const carrierFilter = opts.carrierId || null;

  const routesRes = await query(
    `select fr.*, ft.carrier_id, c.name as carrier_name from app.freight_routes fr
     join app.freight_table_versions v on v.id = fr.version_id and v.status = 'PUBLISHED'
     join app.freight_tables ft on ft.id = v.table_id
     left join app.carriers c on c.id = ft.carrier_id
     where fr.account_id = $1 and ($2::uuid is null or ft.carrier_id = $2)`,
    [accountId, carrierFilter]
  );
  const routes = routesRes.rows;
  if (!routes.length) return { rows: [], bands: [], summary: { routes: 0 } };
  const rules = (await query('select * from app.shipping_rules where account_id = $1', [accountId])).rows;
  return computeExportRows(routes, rules, { channel, invoiceValue, weightBands: opts.weightBands });
}

// Parte pura (sem banco): rotas publicadas + regras -> linhas CEP x peso.
export function computeExportRows(routes, rules, { channel = null, invoiceValue = 0, weightBands = null } = {}) {
  const opts = { weightBands };
  const carrierNames = new Map(routes.map((r) => [r.carrier_id, r.carrier_name]));

  // Faixas de peso: as mesmas das tabelas ("auto") ou uma lista informada.
  let bands = Array.isArray(opts.weightBands) && opts.weightBands.length
    ? opts.weightBands.map(Number).filter((n) => n > 0)
    : [...new Set(routes.map((r) => Number(r.max_weight)).filter((n) => n > 0 && n < 5000))].sort((a, b) => a - b);
  if (!bands.length || bands.length > AUTO_BANDS_LIMIT) bands = DEFAULT_BANDS;
  bands = [...new Set(bands)].sort((a, b) => a - b);

  // Segmentos de CEP sem sobreposição: todos os inícios/fins das rotas.
  const cuts = new Set();
  for (const r of routes) { cuts.add(cepNum(r.cep_start)); cuts.add(cepNum(r.cep_end) + 1); }
  // Também corta nas divisas de UF (faixas de CEP por estado), para cada linha ter um único estado e as regras por UF valerem certo.
  const lo = Math.min(...routes.map((r) => cepNum(r.cep_start)));
  const hi = Math.max(...routes.map((r) => cepNum(r.cep_end)));
  for (const [a, b] of CEP_RANGES) { const s0 = a * 1000; const e0 = b * 1000 + 999; if (s0 > lo && s0 <= hi) cuts.add(s0); if (e0 + 1 > lo && e0 + 1 <= hi) cuts.add(e0 + 1); }
  const points = [...cuts].sort((a, b) => a - b);
  const sorted = routes.map((r) => ({ r, s: cepNum(r.cep_start), e: cepNum(r.cep_end) })).sort((a, b) => a.s - b.s);

  const rows = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const segStart = points[i];
    const segEnd = points[i + 1] - 1;
    const covering = sorted.filter((x) => x.s <= segStart && x.e >= segEnd).map((x) => x.r);
    if (!covering.length) continue;
    const cep = fmtCep(segStart);
    const uf = cepToUf(cep);

    let prevMax = 0;
    for (const w of bands) {
      const request = { destinationPostalCode: cep, state: uf, weightKg: w, lengthCm: 1, widthCm: 1, heightCm: 1, invoiceAmount: invoiceValue, channel };
      const options = covering.map((route) => calculateRouteQuote({ route, request })).filter(Boolean);
      const ranked = applyShippingRules(options, rules, { ...request, destinationPostalCode: cep, billableWeight: w, recipientType: 'PF', skus: [], categories: [] });
      const best = ranked[0];
      if (best) {
        rows.push({ cepStart: segStart, cepEnd: segEnd, uf, minKg: prevMax === 0 ? 0 : Number((prevMax + 0.001).toFixed(3)), maxKg: w, amount: best.totalAmount, days: best.totalDays, carrier: carrierNames.get(best.carrierId) || '' });
        if (rows.length > MAX_ROWS) throw new Error('A tabela exportada passou de 400 mil linhas. Use menos faixas de peso ou exporte por transportadora.');
      }
      prevMax = w;
    }
  }

  // Junta faixas de CEP vizinhas com os mesmos valores para deixar a planilha menor.
  const merged = [];
  const key = (r) => `${r.minKg}|${r.maxKg}|${r.amount}|${r.days}|${r.carrier}|${r.uf}`;
  const lastByKey = new Map();
  for (const r of rows.sort((a, b) => a.minKg - b.minKg || a.cepStart - b.cepStart)) {
    const k = key(r);
    const last = lastByKey.get(k);
    if (last && last.cepEnd + 1 === r.cepStart) { last.cepEnd = r.cepEnd; continue; }
    const copy = { ...r };
    merged.push(copy);
    lastByKey.set(k, copy);
  }
  merged.sort((a, b) => a.cepStart - b.cepStart || a.minKg - b.minKg);
  return { rows: merged, bands, summary: { routes: routes.length, rows: merged.length } };
}

export function freightExportWorkbook({ rows, bands }, { channelLabel = 'todos os canais', invoiceValue = 0 } = {}) {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
    'CEP Inicial': fmtCep(r.cepStart),
    'CEP Final': fmtCep(r.cepEnd),
    UF: r.uf || '',
    'Peso Inicial (kg)': r.minKg,
    'Peso Final (kg)': r.maxKg,
    'Valor do Frete (R$)': r.amount,
    'Prazo (dias úteis)': r.days,
    Transportadora: r.carrier
  })));
  sheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 5 }, { wch: 16 }, { wch: 15 }, { wch: 18 }, { wch: 17 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, sheet, 'Frete');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Tabela de frete exportada pelo TMS Lessul'],
    ['Gerada em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
    ['Canal (regras de frete aplicadas)', channelLabel],
    ['Valor de NF de referência (ad valorem e GRIS)', invoiceValue ? `R$ ${invoiceValue.toFixed(2).replace('.', ',')}` : 'não considerado (R$ 0,00)'],
    ['Faixas de peso (kg)', bands.join(' | ')],
    [],
    ['Como foi calculado'],
    ['Cada linha usa o peso final da faixa e a melhor opção entre as tabelas publicadas (ou a transportadora escolhida), já com as regras de frete do canal.'],
    ['Taxas percentuais sobre a nota (ad valorem, GRIS) usam o valor de NF de referência acima; em pedidos com valor diferente o frete real pode variar.'],
    ['Peso cubado não é considerado: a plataforma deve informar o maior entre peso real e cubado.']
  ]), 'Informações');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
