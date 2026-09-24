import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import forge from 'node-forge';
import { parseCteXml, nfeNumberFromKey, gunzipBase64 } from '../src/services/cte/cteParser.js';
import { encryptSecret, decryptSecret } from '../src/services/cte/secretBox.js';
import { inspectPfx } from '../src/services/cte/certificate.js';
import { parseDistributionResponse } from '../src/services/cte/sefazDistribution.js';
import { applyShippingRules } from '../src/services/rulesEngine.js';
import { toKg, toCm, normalizeMeasures } from '../src/services/units.js';

const CHAVE = '41260912345678000190570010000012341000012345';
const NFE = '41260998765432000110550010000456781000045678';
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe><infCte Id="CTe${CHAVE}" versao="4.00">
<ide><cUF>41</cUF><serie>1</serie><nCT>1234</nCT><dhEmi>2026-09-20T10:00:00-03:00</dhEmi><xMunFim>Porto Alegre</xMunFim><UFFim>RS</UFFim><toma3><toma>0</toma></toma3></ide>
<emit><CNPJ>12345678000190</CNPJ><xNome>Transportadora Sul &amp; Cia</xNome></emit>
<rem><CNPJ>98765432000110</CNPJ><xNome>Lessul</xNome></rem>
<dest><CPF>12345678901</CPF><xNome>Maria</xNome></dest>
<vPrest><vTPrest>45.90</vTPrest><vRec>45.90</vRec></vPrest>
<infCTeNorm><infDoc><infNFe><chave>${NFE}</chave></infNFe></infDoc></infCTeNorm>
</infCte></CTe><protCTe><infProt><chCTe>${CHAVE}</chCTe></infProt></protCTe></cteProc>`;

export function runCteAuditTests() {
  // Parser de CT-e
  const c = parseCteXml(SAMPLE);
  assert.equal(c.chave, CHAVE);
  assert.equal(c.numero, '1234');
  assert.equal(c.emitenteCnpj, '12345678000190');
  assert.equal(c.emitenteNome, 'Transportadora Sul & Cia');
  assert.equal(c.tomadorCnpj, '98765432000110'); // toma=0 -> remetente
  assert.equal(c.destinatarioDocumento, '12345678901');
  assert.equal(c.valorPrestacao, 45.9);
  assert.deepEqual(c.nfeChaves, [NFE]);
  assert.equal(nfeNumberFromKey(NFE), '45678');
  assert.equal(gunzipBase64(zlib.gzipSync(SAMPLE).toString('base64')), SAMPLE);
  assert.throws(() => parseCteXml('<nfeProc/>'));

  // Resposta da SEFAZ (distribuição DF-e)
  const zip = zlib.gzipSync(SAMPLE).toString('base64');
  const resp = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
<cteDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe"><cteDistDFeInteresseResult>
<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00"><tpAmb>1</tpAmb><cStat>138</cStat><xMotivo>Documento(s) localizado(s)</xMotivo>
<ultNSU>000000000000012</ultNSU><maxNSU>000000000000015</maxNSU><loteDistDFeInt><docZip NSU="000000000000012" schema="procCTe_v4.00.xsd">${zip}</docZip></loteDistDFeInt>
</retDistDFeInt></cteDistDFeInteresseResult></cteDistDFeInteresseResponse></soap:Body></soap:Envelope>`;
  const batch = parseDistributionResponse(resp);
  assert.equal(batch.cStat, '138');
  assert.equal(batch.ultNSU, '000000000000012');
  assert.equal(batch.maxNSU, '000000000000015');
  assert.equal(batch.docs.length, 1);
  assert.equal(batch.docs[0].schema, 'procCTe_v4.00.xsd');
  assert.equal(parseCteXml(batch.docs[0].xml).chave, CHAVE);

  // Criptografia de segredos
  process.env.CERTIFICATE_ENCRYPTION_KEY = 'a'.repeat(64);
  const enc = encryptSecret('senha-secreta');
  assert.notEqual(enc.includes('senha'), true);
  assert.equal(decryptSecret(enc).toString('utf8'), 'senha-secreta');

  // Certificado A1 gerado no teste
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01');
  cert.validity.notAfter = new Date('2027-01-01');
  const attrs = [{ name: 'commonName', value: 'LESSUL COMERCIO LTDA:98765432000110' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'senha123', { algorithm: '3des' });
  const pfx = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
  const info = inspectPfx(pfx, 'senha123');
  assert.equal(info.cnpj, '98765432000110');
  assert.equal(new Date(info.validTo).getUTCFullYear(), 2027);
  assert.throws(() => inspectPfx(pfx, 'errada'), /senha/);

  // Regras com múltiplas UFs/canais/transportadoras
  const opts = [{ carrierId: 'A', totalAmount: 100, totalDays: 5 }, { carrierId: 'B', totalAmount: 90, totalDays: 5 }];
  const rules = [
    { name: 'sudeste', active: true, priority: 1, conditions: { states: ['SP', 'RJ', 'MG', 'ES'], channels: ['shopee', 'magalu'] }, actions: { discount_percent: 10 } },
    { name: 'bloq', active: true, priority: 2, conditions: { states: ['SP'] }, actions: { block_carriers: ['B'] } },
    { name: 'antiga', active: true, priority: 3, conditions: { state: 'SP' }, actions: { add_days: 1 } }
  ];
  const sp = applyShippingRules(opts, rules, { state: 'SP', channel: 'shopee' });
  assert.equal(sp.length, 1);
  assert.equal(sp[0].totalAmount, 90);
  assert.equal(sp[0].totalDays, 6);
  const mg = applyShippingRules(opts, rules, { state: 'MG', channel: 'tiny' });
  assert.equal(mg.length, 2);
  assert.equal(mg[0].totalAmount, 90); // sem desconto: canal não confere

  // Conversão de unidades
  assert.equal(toKg('800', 'g'), 0.8);
  assert.equal(toKg('2,5', 'kg'), 2.5);
  assert.equal(toCm(1.2, 'm'), 120);
  assert.equal(toCm(250, 'mm'), 25);
  assert.deepEqual(normalizeMeasures({ weight: 500, weightUnit: 'g', length: 0.3, width: 0.2, height: 0.1, dimensionUnit: 'm' }), { weightKg: 0.5, lengthCm: 30, widthCm: 20, heightCm: 10 });
  assert.throws(() => toKg(1, 'arroba'));
}
