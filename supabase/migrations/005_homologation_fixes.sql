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

create unique index if not exists uq_webhook_logs_account_provider_event_key
  on app.webhook_logs(account_id, provider, event_key);

drop index if exists app.uq_tracking_external_event;
create unique index if not exists uq_tracking_external_event
  on app.tracking_events(account_id, shipment_id, external_event_id);

drop index if exists app.uq_sync_jobs_idempotency;
create unique index if not exists uq_sync_jobs_idempotency
  on app.sync_jobs(account_id, kind, idempotency_key);
