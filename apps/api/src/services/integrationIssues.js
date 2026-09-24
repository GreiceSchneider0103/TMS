import { query } from '../db.js';

// Pendências de integração: um registro aberto por (origem, motivo, pedido). Repetições só incrementam tentativas.
export const ISSUE_REASONS = {
  cep_invalido: 'CEP inválido',
  transportadora_nao_mapeada: 'Transportadora não mapeada',
  sem_cotacao: 'Nenhuma tabela atende o destino',
  erro_integracao: 'Erro na integração'
};

export async function recordIssue({ accountId, source, reason, message, orderId = null, externalRef = null, details = {} }) {
  await query(
    `insert into app.integration_issues(account_id, source, reason, message, order_id, external_ref, details)
     values($1,$2,$3,$4,$5,$6,$7)
     on conflict (account_id, source, reason, coalesce(external_ref, '')) where status = 'aberto'
     do update set message = excluded.message, details = excluded.details, order_id = coalesce(excluded.order_id, app.integration_issues.order_id),
       attempts = app.integration_issues.attempts + 1, last_seen_at = now()`,
    [accountId, source, reason, message || ISSUE_REASONS[reason] || reason, orderId, externalRef, JSON.stringify(details || {})]
  );
}

export async function resolveIssues({ accountId, orderId, reasons = null }) {
  await query(
    `update app.integration_issues set status = 'resolvido', resolved_at = now()
     where account_id = $1 and order_id = $2 and status = 'aberto' and ($3::text[] is null or reason = any($3::text[]))`,
    [accountId, orderId, reasons]
  );
}
