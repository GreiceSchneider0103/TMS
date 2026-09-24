import zlib from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false, // chaves e CNPJs têm muitos dígitos: manter como texto
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ['infNFe', 'docZip', 'infNF', 'infOutros', 'Comp'].includes(name)
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

  return {
    chave,
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
