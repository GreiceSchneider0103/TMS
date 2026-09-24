import { query } from '../db.js';

// Encontra a transportadora do TMS para o nome/serviço informado pelo canal.
// Ordem: de-para mais específico (nome + serviço + canal) -> nome da transportadora ou "nome nas tabelas".
export async function resolveCarrierMapping(accountId, { name, service = null, channel = null }) {
  const n = String(name || '').trim();
  if (!n) return { found: false };
  const m = await query(
    `select * from app.carrier_mappings
     where account_id = $1 and lower(source_name) = lower($2)
       and (source_service is null or lower(source_service) = lower(coalesce($3, '')))
       and (channel is null or channel = $4)
     order by (source_service is not null) desc, (channel is not null) desc limit 1`,
    [accountId, n, service, channel]
  );
  if (m.rows[0]) {
    const r = m.rows[0];
    return { found: true, via: 'depara', carrierId: r.carrier_id, carrierServiceId: r.carrier_service_id, ignore: r.ignore_integration, ignoreCost: r.ignore_cost };
  }
  const c = await query(
    `select id from app.carriers where account_id = $1 and deleted_at is null and (lower(name) = lower($2) or lower(coalesce(external_name, '')) = lower($2)) limit 1`,
    [accountId, n]
  );
  if (c.rows[0]) return { found: true, via: 'cadastro', carrierId: c.rows[0].id, carrierServiceId: null, ignore: false, ignoreCost: false };
  return { found: false };
}
