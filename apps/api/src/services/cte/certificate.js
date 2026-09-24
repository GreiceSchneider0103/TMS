import forge from 'node-forge';
import { HttpError } from '../../utils/router.js';

// Lê um certificado A1 (.pfx/.p12), validando a senha, e extrai titular, CNPJ e validade.
export function inspectPfx(pfxBuffer, password) {
  let p12;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, String(password || ''));
  } catch {
    throw new HttpError(400, 'Não foi possível abrir o certificado: verifique o arquivo (.pfx/.p12) e a senha.');
  }

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  if (!bags.length || !keyBags.length) throw new HttpError(400, 'O arquivo não contém certificado com chave privada (use o certificado A1 completo).');

  // O certificado do titular é o que não é autoridade certificadora.
  const cert = (bags.map((b) => b.cert).find((c) => {
    const bc = c?.getExtension('basicConstraints');
    return c && !(bc && bc.cA);
  }) || bags[0].cert);

  const cn = cert.subject.getField('CN')?.value || '';
  const subject = cert.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ');
  const cnpj = (cn.match(/(\d{14})/) || [])[1] || extractCnpjFromSan(cert) || null;

  return { subject: cn || subject, cnpj, validFrom: cert.validity.notBefore, validTo: cert.validity.notAfter };
}

// Certificados e-CNPJ ICP-Brasil trazem o CNPJ no otherName OID 2.16.76.1.3.3 do SAN.
function extractCnpjFromSan(cert) {
  try {
    const ext = cert.getExtension('subjectAltName');
    const text = JSON.stringify(ext?.altNames || []);
    return (text.match(/(\d{14})/) || [])[1] || null;
  } catch {
    return null;
  }
}
