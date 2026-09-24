import { query } from '../../db.js';
import { parseCteXml, nfeNumberFromKey } from './cteParser.js';

// Grava (ou atualiza) um CT-e e tenta vinculá-lo a um embarque. Retorna { id, created, matched }.
export async function saveCte({ accountId, xml, source, nsu = null, companyId = null }) {
  const c = parseCteXml(xml);
  const carrier = c.emitenteCnpj
    ? await query('select id from app.carriers where account_id = $1 and regexp_replace(coalesce(cnpj, \'\'), \'\\D\', \'\', \'g\') = $2 and deleted_at is null limit 1', [accountId, c.emitenteCnpj])
    : { rows: [] };

  const { rows } = await query(
    `insert into app.ctes(account_id, company_id, chave, numero, serie, data_emissao, emitente_cnpj, emitente_nome, tomador_cnpj, remetente_cnpj,
       destinatario_documento, destinatario_nome, destino_uf, destino_cidade, valor_prestacao, valor_receber, nfe_chaves, carrier_id, source, nsu, xml)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     on conflict (account_id, chave) do update set
       valor_prestacao = excluded.valor_prestacao, valor_receber = excluded.valor_receber, nfe_chaves = excluded.nfe_chaves,
       carrier_id = coalesce(app.ctes.carrier_id, excluded.carrier_id), company_id = coalesce(app.ctes.company_id, excluded.company_id),
       xml = excluded.xml, updated_at = now()
     returning id, shipment_id, (xmax = 0) as created`,
    [accountId, companyId, c.chave, c.numero, c.serie, c.dataEmissao, c.emitenteCnpj, c.emitenteNome, c.tomadorCnpj, c.remetenteCnpj,
      c.destinatarioDocumento, c.destinatarioNome, c.destinoUf, c.destinoCidade, c.valorPrestacao, c.valorReceber, c.nfeChaves,
      carrier.rows[0]?.id || null, source, nsu, xml]
  );

  const row = rows[0];
  let matched = Boolean(row.shipment_id);
  if (!matched) matched = await autoMatch(accountId, row.id, c, carrier.rows[0]?.id || null);
  return { id: row.id, created: row.created, matched, chave: c.chave, numero: c.numero };
}

// Vincula pelo número do CT-e já informado no embarque ou pelo número da NF-e transportada.
async function autoMatch(accountId, cteId, c, carrierId) {
  const nfNumbers = c.nfeChaves.map(nfeNumberFromKey).filter(Boolean);
  const { rows } = await query(
    `select s.id from app.shipments s
     where s.account_id = $1
       and ($4::uuid is null or s.carrier_id is null or s.carrier_id = $4)
       and (
         (s.cte_number is not null and ltrim(s.cte_number, '0') = ltrim($2, '0'))
         or (s.invoice_number is not null and ltrim(regexp_replace(s.invoice_number, '\\D', '', 'g'), '0') = any($3::text[]))
       )
       and not exists (select 1 from app.ctes x where x.account_id = $1 and x.shipment_id = s.id and x.id <> $5)
     order by s.created_at desc limit 2`,
    [accountId, c.numero || '', nfNumbers, carrierId, cteId]
  );
  if (rows.length !== 1) return false; // nenhum ou ambíguo: deixa para vínculo manual
  await linkCte({ accountId, cteId, shipmentId: rows[0].id, method: 'automatico' });
  return true;
}

export async function linkCte({ accountId, cteId, shipmentId, method = 'manual' }) {
  const { rows } = await query(
    `update app.ctes set shipment_id = $3, match_method = case when $3::uuid is null then null else $4 end, updated_at = now()
     where account_id = $1 and id = $2 returning id, numero, shipment_id`,
    [accountId, cteId, shipmentId, method]
  );
  if (!rows[0]) throw new Error('CT-e não encontrado.');
  if (shipmentId && rows[0].numero) {
    await query('update app.shipments set cte_number = coalesce(cte_number, $3), updated_at = now() where account_id = $1 and id = $2', [accountId, shipmentId, rows[0].numero]);
  }
  return rows[0];
}
