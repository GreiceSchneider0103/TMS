import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { HttpError } from '../utils/router.js';
import { logAudit } from '../services/audit.js';
import { encryptSecret, decryptSecret } from '../services/cte/secretBox.js';
import { inspectPfx } from '../services/cte/certificate.js';
import { fetchDistributionBatch } from '../services/cte/sefazDistribution.js';
import { saveCte, linkCte } from '../services/cte/cteStore.js';
import { parseIsoDateOrDefault } from '../utils/validation.js';

const READ_ROLES = ['admin', 'financeiro', 'operador_logistico'];
const MAX_BATCHES_PER_SYNC = 20;

export function registerFreightAuditRoutes(app) {
  // ---------- Certificado digital da empresa ----------
  app.get('/companies/:id/certificate', requireAnyRole(['admin', 'financeiro'], async ({ ctx, params }) => {
    const { rows } = await query(
      'select subject, cnpj, valid_from, valid_to, updated_at from app.company_certificates where account_id = $1 and company_id = $2',
      [ctx.accountId, params.id]
    );
    return { certificate: rows[0] || null, correlationId: ctx.correlationId };
  }));

  app.post('/companies/:id/certificate', requireAnyRole(['admin'], async ({ ctx, params, body }) => {
    const company = await query('select id, cnpj from app.companies where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, params.id]);
    if (!company.rows[0]) throw new Error('Company not found');
    if (!body.pfxBase64) throw new HttpError(400, 'Envie o arquivo do certificado (.pfx ou .p12).');

    const pfx = Buffer.from(String(body.pfxBase64), 'base64');
    const info = inspectPfx(pfx, body.password);
    if (info.validTo && new Date(info.validTo) < new Date()) throw new HttpError(400, 'Este certificado está vencido.');
    const companyCnpj = String(company.rows[0].cnpj || '').replace(/\D/g, '');
    if (info.cnpj && companyCnpj && info.cnpj.slice(0, 8) !== companyCnpj.slice(0, 8)) {
      throw new HttpError(400, `O certificado pertence ao CNPJ ${info.cnpj}, diferente do CNPJ da empresa (${companyCnpj}).`);
    }

    await query(
      `insert into app.company_certificates(account_id, company_id, pfx_encrypted, password_encrypted, subject, cnpj, valid_from, valid_to)
       values($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (account_id, company_id) do update set pfx_encrypted = excluded.pfx_encrypted, password_encrypted = excluded.password_encrypted,
         subject = excluded.subject, cnpj = excluded.cnpj, valid_from = excluded.valid_from, valid_to = excluded.valid_to, updated_at = now()`,
      [ctx.accountId, params.id, encryptSecret(pfx), encryptSecret(String(body.password || '')), info.subject, info.cnpj, info.validFrom, info.validTo]
    );
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'company_certificate', entityId: params.id, action: 'upload', afterData: { cnpj: info.cnpj, validTo: info.validTo }, correlationId: ctx.correlationId });
    return { certificate: { subject: info.subject, cnpj: info.cnpj, valid_from: info.validFrom, valid_to: info.validTo }, correlationId: ctx.correlationId };
  }));

  app.delete('/companies/:id/certificate', requireAnyRole(['admin'], async ({ ctx, params }) => {
    await query('delete from app.company_certificates where account_id = $1 and company_id = $2', [ctx.accountId, params.id]);
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'company_certificate', entityId: params.id, action: 'delete', correlationId: ctx.correlationId });
    return { deleted: true, correlationId: ctx.correlationId };
  }));

  // ---------- Importação de CT-e ----------
  app.post('/ctes/import', requireAnyRole(['admin', 'financeiro', 'operador_logistico'], async ({ ctx, body }) => {
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) throw new HttpError(400, 'Envie ao menos um arquivo XML de CT-e.');
    const summary = { imported: 0, updated: 0, matched: 0, errors: [] };
    for (const f of files.slice(0, 500)) {
      try {
        const xml = Buffer.from(String(f.contentBase64 || ''), 'base64').toString('utf8');
        const res = await saveCte({ accountId: ctx.accountId, xml, source: 'upload', companyId: body.companyId || null });
        if (res.created) summary.imported += 1; else summary.updated += 1;
        if (res.matched) summary.matched += 1;
      } catch (error) {
        summary.errors.push(`${f.fileName || 'arquivo'}: ${error.message}`);
      }
    }
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'cte', entityId: ctx.accountId, action: 'import', afterData: { count: summary.imported, updated: summary.updated, matched: summary.matched }, correlationId: ctx.correlationId });
    return { ...summary, correlationId: ctx.correlationId };
  }));

  app.get('/ctes/sefaz-status', requireAnyRole(READ_ROLES, async ({ ctx }) => {
    const { rows } = await query(
      `select c.id as company_id, c.trade_name, c.cnpj, c.state, cc.valid_to as certificate_valid_to,
              s.ult_nsu, s.max_nsu, s.last_status, s.last_message, s.last_run_at, s.next_allowed_at
       from app.companies c
       left join app.company_certificates cc on cc.company_id = c.id and cc.account_id = c.account_id
       left join app.sefaz_dist_state s on s.company_id = c.id and s.account_id = c.account_id and s.environment = $2
       where c.account_id = $1 and c.deleted_at is null order by c.trade_name`,
      [ctx.accountId, sefazEnvironment()]
    );
    return { environment: sefazEnvironment(), items: rows, correlationId: ctx.correlationId };
  }));

  // Busca na SEFAZ os CT-es em que o CNPJ da empresa aparece (tomador, remetente, destinatário...).
  app.post('/ctes/sefaz-sync', requireAnyRole(['admin', 'financeiro'], async ({ ctx, body }) => {
    const environment = sefazEnvironment();
    const company = await query('select id, cnpj, state from app.companies where account_id = $1 and id = $2 and deleted_at is null', [ctx.accountId, body.companyId]);
    if (!company.rows[0]) throw new Error('Company not found');
    const cert = await query('select pfx_encrypted, password_encrypted, valid_to from app.company_certificates where account_id = $1 and company_id = $2', [ctx.accountId, body.companyId]);
    if (!cert.rows[0]) throw new HttpError(400, 'Cadastre o certificado digital A1 da empresa antes de consultar a SEFAZ.');
    if (cert.rows[0].valid_to && new Date(cert.rows[0].valid_to) < new Date()) throw new HttpError(400, 'O certificado digital da empresa está vencido.');

    const stateRes = await query('select * from app.sefaz_dist_state where account_id = $1 and company_id = $2 and environment = $3', [ctx.accountId, body.companyId, environment]);
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
            const res = await saveCte({ accountId: ctx.accountId, xml: d.xml, source: 'sefaz', nsu: d.nsu, companyId: body.companyId });
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
    } finally {
      await query(
        `insert into app.sefaz_dist_state(account_id, company_id, environment, ult_nsu, max_nsu, last_status, last_message, last_run_at, next_allowed_at)
         values($1,$2,$3,$4,$5,$6,$7,now(),$8)
         on conflict (account_id, company_id, environment) do update set ult_nsu = excluded.ult_nsu, max_nsu = excluded.max_nsu,
           last_status = excluded.last_status, last_message = excluded.last_message, last_run_at = now(), next_allowed_at = excluded.next_allowed_at`,
        [ctx.accountId, body.companyId, environment, ultNSU, maxNSU, lastStatus, lastMessage, nextAllowedAt]
      );
    }

    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'cte', entityId: body.companyId, action: 'sefaz_sync', afterData: { count: summary.imported, updated: summary.updated, matched: summary.matched, status: lastStatus }, correlationId: ctx.correlationId });
    return { ...summary, sefazStatus: lastStatus, sefazMessage: lastMessage, correlationId: ctx.correlationId };
  }));

  app.get('/ctes', requireAnyRole(READ_ROLES, async ({ ctx, query: qs }) => {
    const { rows } = await query(
      `select x.id, x.chave, x.numero, x.serie, x.data_emissao, x.emitente_cnpj, x.emitente_nome, x.destinatario_nome, x.destino_uf, x.destino_cidade,
              x.valor_prestacao, x.nfe_chaves, x.shipment_id, x.match_method, x.source, c.name as carrier_name, o.order_number
       from app.ctes x
       left join app.carriers c on c.id = x.carrier_id
       left join app.shipments s on s.id = x.shipment_id
       left join app.orders o on o.id = s.order_id
       where x.account_id = $1 and ($2::boolean is not true or x.shipment_id is null)
       order by x.data_emissao desc nulls last limit 500`,
      [ctx.accountId, qs.unmatched === 'true']
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.patch('/ctes/:id/link', requireAnyRole(['admin', 'financeiro', 'operador_logistico'], async ({ ctx, params, body }) => {
    const shipmentId = body.shipmentId || null;
    if (shipmentId) {
      const s = await query('select id from app.shipments where account_id = $1 and id = $2', [ctx.accountId, shipmentId]);
      if (!s.rows[0]) throw new Error('Shipment not found');
    }
    const row = await linkCte({ accountId: ctx.accountId, cteId: params.id, shipmentId, method: 'manual' });
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'cte', entityId: params.id, action: shipmentId ? 'link' : 'unlink', afterData: { shipmentId }, correlationId: ctx.correlationId });
    return { ...row, correlationId: ctx.correlationId };
  }));

  // ---------- Conciliação: frete cobrado x contratado x pago (CT-e) ----------
  app.get('/freight-audit', requireAnyRole(READ_ROLES, async ({ ctx, query: qs }) => {
    const from = parseIsoDateOrDefault(qs.from, '1970-01-01', 'from');
    const to = parseIsoDateOrDefault(qs.to, '2999-12-31', 'to');
    const tolerancePct = Math.max(0, Number(qs.tolerancePct ?? 1)) / 100;

    const { rows } = await query(
      `select s.id as shipment_id, s.created_at, s.status, s.tracking_code, s.invoice_number,
              o.id as order_id, o.order_number, o.channel,
              c.name as carrier_name,
              o.shipping_amount as charged,
              qr.total_amount as contracted,
              ct.paid, ct.cte_count, ct.cte_numbers
       from app.shipments s
       join app.orders o on o.id = s.order_id
       left join app.carriers c on c.id = s.carrier_id
       left join app.quote_results qr on qr.id = s.quote_result_id
       left join lateral (
         select sum(x.valor_prestacao) as paid, count(*) as cte_count, string_agg(x.numero, ', ') as cte_numbers
         from app.ctes x where x.account_id = $1 and x.shipment_id = s.id
       ) ct on true
       where s.account_id = $1 and s.created_at::date between $2 and $3
       order by s.created_at desc limit 1000`,
      [ctx.accountId, from, to]
    );

    const items = rows.map((r) => {
      const charged = r.charged === null ? null : Number(r.charged);
      const contracted = r.contracted === null ? null : Number(r.contracted);
      const paid = Number(r.cte_count) > 0 ? Number(r.paid || 0) : null;
      const tolerance = Math.max(0.1, (contracted || 0) * tolerancePct);
      let status = 'sem_cte';
      if (paid !== null && contracted === null) status = 'sem_cotacao';
      else if (paid !== null) status = paid - contracted > tolerance ? 'pago_acima' : contracted - paid > tolerance ? 'pago_abaixo' : 'conciliado';
      return {
        ...r,
        charged, contracted, paid,
        paid_vs_contracted: paid !== null && contracted !== null ? round2(paid - contracted) : null,
        margin: paid !== null && charged !== null ? round2(charged - paid) : null,
        audit_status: status
      };
    });

    const sum = (key) => round2(items.reduce((acc, i) => acc + (i[key] || 0), 0));
    const unmatched = await query('select count(*)::int as n, coalesce(sum(valor_prestacao), 0) as total from app.ctes where account_id = $1 and shipment_id is null', [ctx.accountId]);
    return {
      items,
      totals: {
        shipments: items.length,
        charged: sum('charged'),
        contracted: sum('contracted'),
        paid: sum('paid'),
        divergent: items.filter((i) => i.audit_status === 'pago_acima' || i.audit_status === 'pago_abaixo').length,
        withoutCte: items.filter((i) => i.audit_status === 'sem_cte').length,
        overpaid: round2(items.filter((i) => i.audit_status === 'pago_acima').reduce((a, i) => a + i.paid_vs_contracted, 0)),
        unmatchedCtes: unmatched.rows[0].n,
        unmatchedCtesAmount: Number(unmatched.rows[0].total)
      },
      correlationId: ctx.correlationId
    };
  }));
}

function sefazEnvironment() {
  return process.env.SEFAZ_CTE_ENVIRONMENT === 'homologacao' ? 'homologacao' : 'producao';
}

const round2 = (n) => Number(Number(n).toFixed(2));
