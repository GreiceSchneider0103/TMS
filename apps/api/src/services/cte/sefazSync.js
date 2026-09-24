import { query } from '../../db.js';
import { HttpError } from '../../utils/router.js';
import { decryptSecret } from './secretBox.js';
import { fetchDistributionBatch } from './sefazDistribution.js';
import { saveCte } from './cteStore.js';

const MAX_BATCHES_PER_SYNC = 20;

export function sefazEnvironment() {
  return process.env.SEFAZ_CTE_ENVIRONMENT === 'homologacao' ? 'homologacao' : 'producao';
}

// Busca na SEFAZ os CT-es em que o CNPJ da empresa aparece (tomador, remetente, destinatário...).
export async function syncCompanyCtes({ accountId, companyId }) {
  const environment = sefazEnvironment();
  const company = await query('select id, cnpj, state from app.companies where account_id = $1 and id = $2 and deleted_at is null', [accountId, companyId]);
  if (!company.rows[0]) throw new Error('Company not found');
  const cert = await query('select pfx_encrypted, password_encrypted, valid_to from app.company_certificates where account_id = $1 and company_id = $2', [accountId, companyId]);
  if (!cert.rows[0]) throw new HttpError(400, 'Cadastre o certificado digital A1 da empresa antes de consultar a SEFAZ.');
  if (cert.rows[0].valid_to && new Date(cert.rows[0].valid_to) < new Date()) throw new HttpError(400, 'O certificado digital da empresa está vencido.');

  const stateRes = await query('select * from app.sefaz_dist_state where account_id = $1 and company_id = $2 and environment = $3', [accountId, companyId, environment]);
  const state = stateRes.rows[0] || { ult_nsu: '000000000000000' };
  if (state.next_allowed_at && new Date(state.next_allowed_at) > new Date()) {
    const minutes = Math.ceil((new Date(state.next_allowed_at) - Date.now()) / 60000);
    throw new HttpError(429, `A SEFAZ só permite nova consulta em ${minutes} minuto(s), pois não havia documentos novos na última busca.`);
  }

  const pfx = decryptSecret(cert.rows[0].pfx_encrypted);
  const passphrase = decryptSecret(cert.rows[0].password_encrypted).toString('utf8');
  const cnpj = String(company.rows[0].cnpj).replace(/\D/g, '');
  let ultNSU = state.ult_nsu || '000000000000000';
  let maxNSU = state.max_nsu || null;
  let lastStatus = null;
  let lastMessage = null;
  let nextAllowedAt = null;
  const summary = { imported: 0, updated: 0, matched: 0, ignored: 0, errors: [] };

  try {
    for (let i = 0; i < MAX_BATCHES_PER_SYNC; i += 1) {
      const batch = await fetchDistributionBatch({ environment, cnpj, uf: company.rows[0].state, ultNSU, pfx, passphrase });
      lastStatus = batch.cStat;
      lastMessage = batch.xMotivo;
      if (batch.cStat === '137' || batch.cStat === '656') {
        // 137: nenhum documento novo; 656: consumo indevido. A SEFAZ exige aguardar 1 hora.
        nextAllowedAt = new Date(Date.now() + 60 * 60 * 1000);
        if (batch.ultNSU) ultNSU = batch.ultNSU;
        break;
      }
      if (batch.cStat !== '138') break;

      for (const d of batch.docs) {
        if (!/procCTe/i.test(d.schema)) { summary.ignored += 1; continue; } // eventos e outros documentos
        try {
          const res = await saveCte({ accountId, xml: d.xml, source: 'sefaz', nsu: d.nsu, companyId });
          if (res.created) summary.imported += 1; else summary.updated += 1;
          if (res.matched) summary.matched += 1;
        } catch (error) {
          summary.errors.push(`NSU ${d.nsu}: ${error.message}`);
        }
      }
      ultNSU = batch.ultNSU;
      maxNSU = batch.maxNSU;
      if (!maxNSU || BigInt(ultNSU) >= BigInt(maxNSU)) break;
    }
  } catch (error) {
    lastStatus = 'erro';
    lastMessage = error.message;
    throw error;
  } finally {
    await query(
      `insert into app.sefaz_dist_state(account_id, company_id, environment, ult_nsu, max_nsu, last_status, last_message, last_run_at, next_allowed_at)
       values($1,$2,$3,$4,$5,$6,$7,now(),$8)
       on conflict (account_id, company_id, environment) do update set ult_nsu = excluded.ult_nsu, max_nsu = excluded.max_nsu,
         last_status = excluded.last_status, last_message = excluded.last_message, last_run_at = now(), next_allowed_at = excluded.next_allowed_at`,
      [accountId, companyId, environment, ultNSU, maxNSU, lastStatus, lastMessage, nextAllowedAt]
    );
  }

  return { ...summary, sefazStatus: lastStatus, sefazMessage: lastMessage };
}
