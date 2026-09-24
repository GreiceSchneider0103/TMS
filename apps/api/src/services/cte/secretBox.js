import crypto from 'node:crypto';
import { HttpError } from '../../utils/router.js';

// Criptografia AES-256-GCM para segredos guardados no banco (certificado digital e senha).
// A chave vem de CERTIFICATE_ENCRYPTION_KEY (32 bytes em hex ou base64) e nunca é gravada no banco.
function getKey() {
  const raw = String(process.env.CERTIFICATE_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new HttpError(503, 'Configure a variável CERTIFICATE_ENCRYPTION_KEY no servidor para guardar certificados digitais.');
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new HttpError(503, 'CERTIFICATE_ENCRYPTION_KEY inválida: use 32 bytes em hexadecimal (64 caracteres) ou base64.');
  return key;
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), 'utf8')), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(payload) {
  const [version, iv, tag, data] = String(payload || '').split(':');
  if (version !== 'v1') throw new Error('Formato de segredo desconhecido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
}
