-- Formaliza ajustes aplicados em homologação

create extension if not exists pgcrypto;

create or replace function app.authenticate_api_key(raw_api_key text)
returns table (credential_id uuid, account_id uuid, role app.user_role)
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_hash text;
begin
  v_hash := encode(extensions.digest(raw_api_key, 'sha256'), 'hex');

  return query
  select c.id, c.account_id, c.role
  from app.api_credentials c
  where c.token_hash = v_hash
    and c.is_active = true
  limit 1;
end;
$$;

revoke all on function app.authenticate_api_key(text) from public;
grant execute on function app.authenticate_api_key(text) to anon, authenticated, service_role;

create or replace function app.touch_api_credential(p_credential_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  update app.api_credentials
     set last_used_at = now()
   where id = p_credential_id;
end;
$$;

revoke all on function app.touch_api_credential(uuid) from public;
grant execute on function app.touch_api_credential(uuid) to anon, authenticated, service_role;

-- Deduplicação preventiva para ambientes com dados históricos
-- webhook_logs: manter o mais recente para preservar status/processamento final do evento
with ranked as (
  select
    id,
    row_number() over (
      partition by account_id, provider, event_key
      order by processed_at desc nulls last, received_at desc nulls last, id desc
    ) as rn
  from app.webhook_logs
  where event_key is not null
)
delete from app.webhook_logs wl
using ranked r
where wl.id = r.id
  and r.rn > 1;

-- tracking_events: manter o primeiro evento ocorrido para preservar ordem histórica original
with ranked as (
  select
    id,
    row_number() over (
      partition by account_id, shipment_id, external_event_id
      order by occurred_at asc nulls last, created_at asc nulls last, id asc
    ) as rn
  from app.tracking_events
  where external_event_id is not null
)
delete from app.tracking_events te
using ranked r
where te.id = r.id
  and r.rn > 1;

-- sync_jobs: consolidar estado operacional antes de remover duplicados,
-- mantendo como registro canônico o mais recente por chave
with duplicate_groups as (
  select
    account_id,
    kind,
    idempotency_key,
    array_agg(id order by updated_at desc nulls last, created_at desc nulls last, id desc) as ids
  from app.sync_jobs
  where idempotency_key is not null
  group by account_id, kind, idempotency_key
  having count(*) > 1
),
canonical as (
  select
    account_id,
    kind,
    idempotency_key,
    ids[1] as keep_id,
    coalesce(ids[2:array_length(ids, 1)], '{}'::uuid[]) as drop_ids
  from duplicate_groups
),
metrics as (
  select
    c.keep_id,
    max(s.attempts) as max_attempts,
    bool_or(coalesce(s.dead_letter, false)) as any_dead_letter,
    max(s.updated_at) as max_updated_at,
    (
      select s1.status
      from app.sync_jobs s1
      where s1.id = any(c.drop_ids || c.keep_id)
      order by
        case s1.status
          when 'success' then 60
          when 'dead_letter' then 50
          when 'processing' then 40
          when 'error' then 30
          when 'pending' then 20
          else 10
        end desc,
        s1.updated_at desc nulls last,
        s1.created_at desc nulls last,
        s1.id desc
      limit 1
    ) as best_status,
    (
      select s2.response
      from app.sync_jobs s2
      where s2.id = any(c.drop_ids || c.keep_id)
        and s2.response is not null
      order by s2.updated_at desc nulls last, s2.created_at desc nulls last, s2.id desc
      limit 1
    ) as best_response,
    (
      select s3.error
      from app.sync_jobs s3
      where s3.id = any(c.drop_ids || c.keep_id)
        and s3.error is not null
      order by s3.updated_at desc nulls last, s3.created_at desc nulls last, s3.id desc
      limit 1
    ) as best_error,
    (
      select s4.next_retry_at
      from app.sync_jobs s4
      where s4.id = any(c.drop_ids || c.keep_id)
        and s4.next_retry_at is not null
      order by s4.next_retry_at desc, s4.updated_at desc nulls last, s4.id desc
      limit 1
    ) as best_next_retry_at,
    (
      select s5.correlation_id
      from app.sync_jobs s5
      where s5.id = any(c.drop_ids || c.keep_id)
        and s5.correlation_id is not null
      order by s5.updated_at desc nulls last, s5.created_at desc nulls last, s5.id desc
      limit 1
    ) as best_correlation_id
  from canonical c
  join app.sync_jobs s on s.id = any(c.drop_ids || c.keep_id)
  group by c.keep_id, c.drop_ids
),
consolidated as (
  update app.sync_jobs sj
  set status = coalesce(m.best_status, sj.status),
      response = coalesce(m.best_response, sj.response),
      error = coalesce(m.best_error, sj.error),
      attempts = greatest(sj.attempts, coalesce(m.max_attempts, sj.attempts)),
      dead_letter = coalesce(m.any_dead_letter, sj.dead_letter),
      next_retry_at = case
        when coalesce(m.best_status, sj.status) in ('success', 'dead_letter') then null
        else coalesce(m.best_next_retry_at, sj.next_retry_at)
      end,
      correlation_id = coalesce(m.best_correlation_id, sj.correlation_id),
      updated_at = greatest(sj.updated_at, coalesce(m.max_updated_at, sj.updated_at))
  from metrics m
  where sj.id = m.keep_id
  returning sj.id
)
delete from app.sync_jobs sj
using canonical c
where sj.id = any(c.drop_ids);

create unique index if not exists uq_webhook_logs_account_provider_event_key
  on app.webhook_logs(account_id, provider, event_key);

drop index if exists app.uq_tracking_external_event;
create unique index if not exists uq_tracking_external_event
  on app.tracking_events(account_id, shipment_id, external_event_id);

drop index if exists app.uq_sync_jobs_idempotency;
create unique index if not exists uq_sync_jobs_idempotency
  on app.sync_jobs(account_id, kind, idempotency_key);
