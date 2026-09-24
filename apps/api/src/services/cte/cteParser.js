import zlib from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false, // chaves e CNPJs têm muitos dígitos: manter como texto
  parseAttributeValue: false,
  trimValues: true,
  // infNFe só é lista dentro do CT-e (NFs transportadas); na NF-e é o elemento principal.
  isArray: (name, jpath) => (name === 'infNFe' ? String(jpath).endsWith('infDoc.infNFe') : ['docZip', 'infNF', 'infOutros', 'Comp', 'NFref', 'det', 'infQ'].includes(name))
});

export function parseXml(xml) {
  return parser.parse(String(xml));
}

export function gunzipBase64(b64) {
  return zlib.gunzipSync(Buffer.from(String(b64), 'base64')).toString('utf8');
}

const pick = (o, ...keys) => keys.reduce((acc, k) => (acc === undefined || acc === null ? acc : acc[k]), o);
const text = (v) => (v === undefined || v === null ? null : typeof v === 'object' ? (v['#text'] ?? null) : String(v));
const num = (v) => {
  const n = Number(text(v));
  return Number.isFinite(n) ? n : null;
};

// Extrai os campos usados na auditoria a partir do XML de um CT-e (cteProc ou CTe).
export function parseCteXml(xml) {
  const doc = parseXml(xml);
  const cte = doc.cteProc?.CTe || doc.CTe || doc.procCTe?.CTe;
  const inf = cte?.infCte;
  if (!inf) throw new Error('XML não é um CT-e válido (infCte não encontrado).');

  const chave = String(inf['@_Id'] || '').replace(/^CTe/, '') || text(pick(doc, 'cteProc', 'protCTe', 'infProt', 'chCTe'));
  if (!/^\d{44}$/.test(chave || '')) throw new Error('Chave do CT-e não encontrada no XML.');

  const ide = inf.ide || {};
  const tomaCode = text(pick(ide, 'toma3', 'toma')) ?? text(pick(ide, 'toma4', 'toma'));
  const partyByToma = { 0: inf.rem, 1: inf.exped, 2: inf.receb, 3: inf.dest };
  const tomador = ide.toma4 || partyByToma[tomaCode] || null;
  const docOf = (p) => text(p?.CNPJ) || text(p?.CPF) || null;

  const infDoc = pick(inf, 'infCTeNorm', 'infDoc') || {};
  const nfeChaves = (infDoc.infNFe || []).map((n) => text(n.chave)).filter(Boolean);

  // Quantidades da carga (infQ): usa o peso base de cálculo (cobrado) e o peso real/bruto, em kg.
  const qs = (pick(inf, 'infCTeNorm', 'infCarga', 'infQ') || []).map((q) => ({ unid: text(q.cUnid), tipo: String(text(q.tpMed) || '').toUpperCase(), qtd: num(q.qCarga) }))
    .filter((q) => q.qtd !== null && (q.unid === '01' || q.unid === '02'))
    .map((q) => ({ ...q, kg: q.unid === '02' ? q.qtd * 1000 : q.qtd }));
  const byTipo = (re) => qs.find((q) => re.test(q.tipo))?.kg ?? null;
  const pesoReal = byTipo(/REAL|BRUTO|AFERIDO/) ?? (qs.length ? Math.min(...qs.map((q) => q.kg)) : null);
  const pesoCobrado = byTipo(/B\.?\s*C|BASE|CALC|TAXAD|COBRAD/) ?? (qs.length ? Math.max(...qs.map((q) => q.kg)) : null);

  return {
    chave,
    pesoReal,
    pesoCobrado,
    numero: text(ide.nCT),
    serie: text(ide.serie),
    dataEmissao: text(ide.dhEmi) || text(ide.dEmi),
    emitenteCnpj: docOf(inf.emit),
    emitenteNome: text(inf.emit?.xNome),
    tomadorCnpj: docOf(tomador),
    remetenteCnpj: docOf(inf.rem),
    destinatarioDocumento: docOf(inf.dest),
    destinatarioNome: text(inf.dest?.xNome),
    destinoUf: text(ide.UFFim),
    destinoCidade: text(ide.xMunFim),
    valorPrestacao: num(inf.vPrest?.vTPrest),
    valorReceber: num(inf.vPrest?.vRec),
    nfeChaves
  };
}

// Número da NF-e contido na chave de 44 dígitos (posições 26 a 34).
export function nfeNumberFromKey(chave) {
  const s = String(chave || '');
  return s.length === 44 ? String(Number(s.slice(25, 34))) : null;
}

// Extrai os dados de uma NF-e (nfeProc ou NFe). referencedKeys traz as NF-es citadas em NFref:
// numa triangulação, a NF de remessa do CD referencia a NF de venda.
export function parseNfeXml(xml) {
  const doc = parseXml(xml);
  const nfe = doc.nfeProc?.NFe || doc.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw new Error('XML não é uma NF-e válida (infNFe não encontrado).');

  const chave = String(inf['@_Id'] || '').replace(/^NFe/, '') || text(pick(doc, 'nfeProc', 'protNFe', 'infProt', 'chNFe'));
  if (!/^\d{44}$/.test(chave || '')) throw new Error('Chave da NF-e não encontrada no XML.');

  const ide = inf.ide || {};
  const dets = inf.det || [];
  const docOf = (p) => text(p?.CNPJ) || text(p?.CPF) || null;
  const referencedKeys = (ide.NFref || []).map((r) => text(r.refNFe)).filter(Boolean);
  const pedido = text(inf.compra?.xPed) || text(dets[0]?.prod?.xPed) || null;

  return {
    chave,
    numero: text(ide.nNF),
    serie: text(ide.serie),
    dataEmissao: text(ide.dhEmi) || text(ide.dEmi),
    naturezaOperacao: text(ide.natOp),
    emitenteCnpj: docOf(inf.emit),
    emitenteNome: text(inf.emit?.xNome),
    emitenteUf: text(inf.emit?.enderEmit?.UF),
    destinatarioDocumento: docOf(inf.dest),
    destinatarioNome: text(inf.dest?.xNome),
    destinoUf: text(inf.dest?.enderDest?.UF),
    valorTotal: num(inf.total?.ICMSTot?.vNF),
    valorProdutos: num(inf.total?.ICMSTot?.vProd),
    cfop: text(dets[0]?.prod?.CFOP),
    pedidoReferencia: pedido,
    referencedKeys
  };
}
