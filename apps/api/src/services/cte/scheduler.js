import { query, runWithDbContext } from '../../db.js';
import { logAudit } from '../audit.js';
import { syncCompanyCtes, sefazEnvironment } from './sefazSync.js';

// Busca automática de CT-es na SEFAZ em horários fixos (padrão 08h e 14h, horário de Brasília),
// somente para empresas com certificado e que tenham NFs em aberto (embarques sem CT-e).
// No plano gratuito do Render a API "dorme": o agendamento roda a janela pendente assim que a API acorda
// (o workflow .github/workflows/wake-api.yml acorda a API nesses horários).

const JOB = 'sefaz_cte_sync';
const TIME_ZONE = 'America/Sao_Paulo';
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const OPEN_WINDOW_DAYS = 120;

export function scheduleHours() {
  return String(process.env.SEFAZ_SYNC_HOURS || '8,14').split(',').map((h) => Number(h.trim())).filter((h) => h >= 0 && h <= 23).sort((a, b) => a - b);
}

function localParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// Janela mais recente que já deveria ter rodado (ex.: "2026-09-24@14").
export function dueSlot(now = new Date(), hours = scheduleHours()) {
  if (!hours.length) return null;
  const { day, hour } = localParts(now);
  const today = hours.filter((h) => h <= hour);
  if (today.length) return `${day}@${today[today.length - 1]}`;
  const y = localParts(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return `${y.day}@${hours[hours.length - 1]}`;
}

// Empresas elegíveis: certificado válido, sem espera da SEFAZ e com embarques recentes sem CT-e que tenham NF.
async function eligibleCompanies() {
  const { rows } = await query(
    `select cc.account_id, cc.company_id
     from app.company_certificates cc
     join app.companies c on c.id = cc.company_id and c.deleted_at is null
     left join app.sefaz_dist_state st on st.account_id = cc.account_id and st.company_id = cc.company_id and st.environment = $1
     where (cc.valid_to is null or cc.valid_to > now())
       and (st.next_allowed_at is null or st.next_allowed_at <= now())
       and exists (
         select 1 from app.shipments s
         where s.account_id = cc.account_id and s.created_at > now() - ($2 || ' days')::interval
           and not exists (select 1 from app.ctes x where x.account_id = s.account_id and x.shipment_id = s.id)
           and (s.invoice_number is not null or exists (select 1 from app.order_invoices oi where oi.account_id = s.account_id and oi.order_id = s.order_id))
       )`,
    [sefazEnvironment(), String(OPEN_WINDOW_DAYS)]
  );
  return rows;
}

export async function runScheduledSync({ force = false, now = new Date() } = {}) {
  const slot = force ? `manual@${now.toISOString()}` : dueSlot(now);
  if (!slot) return { skipped: 'sem horários configurados' };

  // "Reserva" a janela de forma atômica: se outra instância já rodou, não roda de novo.
  const claim = await query(
    `insert into app.scheduled_jobs(job, last_slot, last_run_at) values($1, $2, now())
     on conflict (job) do update set last_slot = excluded.last_slot, last_run_at = now()
     where app.scheduled_jobs.last_slot is distinct from excluded.last_slot
     returning job`,
    [JOB, slot]
  );
  if (!claim.rows[0]) return { skipped: 'janela já executada', slot };

  const companies = await eligibleCompanies();
  const results = [];
  for (const c of companies) {
    const ctx = { accountId: c.account_id, role: 'admin', correlationId: `scheduler-${slot}`, userId: '00000000-0000-0000-0000-000000000000' };
    try {
      const res = await runWithDbContext(ctx, () => syncCompanyCtes({ accountId: c.account_id, companyId: c.company_id }));
      results.push({ accountId: c.account_id, companyId: c.company_id, ok: true, imported: res.imported, matched: res.matched, status: res.sefazStatus });
      await runWithDbContext(ctx, () => logAudit({ accountId: c.account_id, userId: ctx.userId, entity: 'cte', entityId: c.company_id, action: 'sefaz_sync', afterData: { count: res.imported, matched: res.matched, status: res.sefazStatus, automatic: true }, correlationId: ctx.correlationId }));
    } catch (error) {
      results.push({ accountId: c.account_id, companyId: c.company_id, ok: false, error: error.message });
    }
  }
  const summary = { slot, companies: companies.length, results };
  await query('update app.scheduled_jobs set last_result = $2 where job = $1', [JOB, JSON.stringify(summary)]);
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'sefaz_scheduled_sync', slot, companies: companies.length }));
  return summary;
}

export async function scheduleStatus() {
  const { rows } = await query('select last_slot, last_run_at, last_result from app.scheduled_jobs where job = $1', [JOB]);
  return { hours: scheduleHours(), timeZone: TIME_ZONE, enabled: schedulerEnabled(), last: rows[0] || null };
}

function schedulerEnabled() {
  return String(process.env.SEFAZ_SCHEDULER_ENABLED || 'true') !== 'false' && Boolean(process.env.CERTIFICATE_ENCRYPTION_KEY);
}

export function startSefazScheduler() {
  if (!schedulerEnabled() || !process.env.DATABASE_URL) return;
  const tick = () => runScheduledSync().catch((error) => console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'sefaz_scheduler_error', message: error.message })));
  setTimeout(tick, 30 * 1000).unref();
  setInterval(tick, CHECK_INTERVAL_MS).unref();
}
