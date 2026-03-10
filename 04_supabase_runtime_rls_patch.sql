-- 04_supabase_runtime_rls_patch.sql
-- Patch corretivo para alinhar RLS com runtime da API (API key -> contexto SQL)
-- Objetivo: remover dependência exclusiva de auth.uid() e suportar contexto por GUC de sessão.

create extension if not exists pgcrypto;

-- 1) Função de contexto para RLS: primeiro GUC, depois fallback auth.uid()
create or replace function app.rls_account_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.current_account_id', true), '')::uuid,
    (select p.account_id from app.profiles p where p.user_id = auth.uid() limit 1)
  );
$$;

create or replace function app.current_account_id()
returns uuid
language sql
stable
as $$
  select app.rls_account_id();
$$;

comment on function app.rls_account_id() is
'RLS runtime context: usa current_setting(''app.current_account_id'') quando API injeta contexto; fallback para auth.uid().';

-- 2) Função segura para autenticar API key sem depender de contexto prévio de tenant
-- SECURITY DEFINER é necessário para bootstrap de contexto antes da RLS por tenant ser aplicável.
create or replace function app.authenticate_api_key(raw_api_key text)
returns table (credential_id uuid, account_id uuid, role app.user_role)
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_hash text;
begin
  v_hash := encode(digest(raw_api_key, 'sha256'), 'hex');

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

-- 3) Função segura para touch de uso de credencial
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

-- 4) Padronização de policies críticas para usar app.rls_account_id() + with check
-- Observação: CREATE POLICY não tem IF NOT EXISTS. Usamos DROP IF EXISTS e recriação.

drop policy if exists p_account_isolation_orders on app.orders;
drop policy if exists p_orders_check on app.orders;
create policy p_orders_tenant_all
  on app.orders
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_order_items on app.order_items;
drop policy if exists p_order_items_check on app.order_items;
create policy p_order_items_tenant_all
  on app.order_items
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_quote_requests on app.quote_requests;
drop policy if exists p_quote_requests_check on app.quote_requests;
create policy p_quote_requests_tenant_all
  on app.quote_requests
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_quote_results on app.quote_results;
drop policy if exists p_quote_results_check on app.quote_results;
create policy p_quote_results_tenant_all
  on app.quote_results
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_shipments on app.shipments;
drop policy if exists p_shipments_check on app.shipments;
create policy p_shipments_tenant_all
  on app.shipments
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_shipment_packages on app.shipment_packages;
drop policy if exists p_shipment_packages_check on app.shipment_packages;
create policy p_shipment_packages_tenant_all
  on app.shipment_packages
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_tracking_events on app.tracking_events;
drop policy if exists p_tracking_events_check on app.tracking_events;
create policy p_tracking_events_tenant_all
  on app.tracking_events
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_sync_jobs on app.sync_jobs;
drop policy if exists p_sync_jobs_check on app.sync_jobs;
create policy p_sync_jobs_tenant_all
  on app.sync_jobs
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_webhook_logs on app.webhook_logs;
drop policy if exists p_webhook_logs_check on app.webhook_logs;
create policy p_webhook_logs_tenant_all
  on app.webhook_logs
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_audit_logs on app.audit_logs;
drop policy if exists p_audit_logs_check on app.audit_logs;
create policy p_audit_logs_tenant_all
  on app.audit_logs
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_freight_tables on app.freight_tables;
drop policy if exists p_freight_tables_check on app.freight_tables;
create policy p_freight_tables_tenant_all
  on app.freight_tables
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_freight_table_versions on app.freight_table_versions;
drop policy if exists p_freight_versions_check on app.freight_table_versions;
create policy p_freight_versions_tenant_all
  on app.freight_table_versions
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_freight_routes on app.freight_routes;
drop policy if exists p_freight_routes_check on app.freight_routes;
create policy p_freight_routes_tenant_all
  on app.freight_routes
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_freight_recipient_fees on app.freight_recipient_fees;
drop policy if exists p_freight_recipient_fees_check on app.freight_recipient_fees;
create policy p_freight_recipient_fees_tenant_all
  on app.freight_recipient_fees
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_shipping_rules on app.shipping_rules;
drop policy if exists p_shipping_rules_check on app.shipping_rules;
create policy p_shipping_rules_tenant_all
  on app.shipping_rules
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

drop policy if exists p_account_isolation_files on app.files;
drop policy if exists p_files_check on app.files;
create policy p_files_tenant_all
  on app.files
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

-- api_credentials: manter bloqueada por tenant em operações regulares
-- (lookup inicial acontece por SECURITY DEFINER function)
drop policy if exists p_account_isolation_api_credentials on app.api_credentials;
create policy p_api_credentials_tenant_all
  on app.api_credentials
  for all
  using (account_id = app.rls_account_id())
  with check (account_id = app.rls_account_id());

-- 5) Garantir FORCE RLS nas tabelas críticas
alter table app.orders force row level security;
alter table app.order_items force row level security;
alter table app.quote_requests force row level security;
alter table app.quote_results force row level security;
alter table app.shipments force row level security;
alter table app.shipment_packages force row level security;
alter table app.tracking_events force row level security;
alter table app.sync_jobs force row level security;
alter table app.webhook_logs force row level security;
alter table app.audit_logs force row level security;
alter table app.freight_tables force row level security;
alter table app.freight_table_versions force row level security;
alter table app.freight_routes force row level security;
alter table app.freight_recipient_fees force row level security;
alter table app.shipping_rules force row level security;
alter table app.files force row level security;
alter table app.api_credentials force row level security;

