import https from 'node:https';
import { parseXml, gunzipBase64 } from './cteParser.js';

// Web service nacional de distribuição de DF-e do CT-e (CTeDistribuicaoDFe).
const ENDPOINTS = {
  producao: 'https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
  homologacao: 'https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx'
};

const UF_CODES = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53
};

function envelope({ tpAmb, cUF, cnpj, ultNSU }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
<soap12:Body><cteDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe"><cteDadosMsg>
<distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${cUF}</cUFAutor><CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${ultNSU}</ultNSU></distNSU></distDFeInt>
</cteDadosMsg></cteDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

function post(url, body, { pfx, passphrase }) {
  const agentOptions = { pfx, passphrase };
  // A SEFAZ usa certificados da cadeia ICP-Brasil, que não vem no Node por padrão:
  // SEFAZ_CA_PEM permite informar a cadeia; SEFAZ_TLS_INSECURE=true desliga a verificação (não recomendado).
  if (process.env.SEFAZ_CA_PEM) agentOptions.ca = process.env.SEFAZ_CA_PEM;
  if (String(process.env.SEFAZ_TLS_INSECURE || '') === 'true') agentOptions.rejectUnauthorized = false;

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      agent: new https.Agent(agentOptions),
      timeout: 60000,
      headers: {
        'content-type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe/cteDistDFeInteresse"',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) return reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}`));
        resolve(text);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao consultar a SEFAZ')));
    req.on('error', (err) => {
      if (/certificate|self.signed|issuer/i.test(err.message)) {
        reject(new Error('Falha na conexão segura com a SEFAZ (cadeia ICP-Brasil). Configure SEFAZ_CA_PEM no servidor.'));
      } else reject(new Error(`Falha ao conectar na SEFAZ: ${err.message}`));
    });
    req.end(body);
  });
}

// Consulta um lote a partir do último NSU. Retorna status, NSUs e documentos já descompactados.
export async function fetchDistributionBatch({ environment = 'producao', cnpj, uf, ultNSU, pfx, passphrase }) {
  const cUF = UF_CODES[String(uf || '').toUpperCase()];
  if (!cUF) throw new Error('UF da empresa inválida para consulta na SEFAZ.');
  const url = ENDPOINTS[environment] || ENDPOINTS.producao;
  const xml = await post(url, envelope({ tpAmb: environment === 'homologacao' ? 2 : 1, cUF, cnpj, ultNSU: String(ultNSU).padStart(15, '0') }), { pfx, passphrase });

  return parseDistributionResponse(xml, ultNSU);
}

export function parseDistributionResponse(xml, ultNSU = '0') {
  const doc = parseXml(xml);
  const body = doc.Envelope?.Body || {};
  const ret = body.cteDistDFeInteresseResponse?.cteDistDFeInteresseResult?.retDistDFeInt || body.retDistDFeInt;
  if (!ret) throw new Error('Resposta inesperada da SEFAZ.');

  const docs = (ret.loteDistDFeInt?.docZip || []).map((d) => ({
    nsu: d['@_NSU'],
    schema: d['@_schema'] || '',
    xml: gunzipBase64(d['#text'])
  }));

  return { cStat: String(ret.cStat), xMotivo: String(ret.xMotivo || ''), ultNSU: String(ret.ultNSU || ultNSU), maxNSU: String(ret.maxNSU || ''), docs };
}
