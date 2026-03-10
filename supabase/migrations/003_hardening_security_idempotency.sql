-- Hardening: multi-tenant auth context, RLS coherence, idempotency, observability
create extension if not exists pgcrypto;

create table if not exists app.api_credentials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  label text not null,
  token_hash text not null,
  role app.user_role not null default 'integracao',
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique(token_hash)
);

alter table app.api_credentials enable row level security;
create policy p_account_isolation_api_credentials on app.api_credentials using (account_id = app.current_account_id());

alter table app.sync_jobs add column if not exists correlation_id text;
alter table app.sync_jobs add column if not exists idempotency_key text;
alter table app.webhook_logs add column if not exists correlation_id text;
alter table app.audit_logs add column if not exists correlation_id text;
alter table app.shipments add column if not exists idempotency_key text;

create unique index if not exists uq_sync_jobs_idempotency on app.sync_jobs(account_id, kind, idempotency_key) where idempotency_key is not null;
create unique index if not exists uq_shipments_idempotency on app.shipments(account_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists uq_shipments_order_quote on app.shipments(account_id, order_id, quote_result_id) where quote_result_id is not null;

-- Explicit RLS policies for critical tables with with-check
create policy p_orders_check on app.orders for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_order_items_check on app.order_items for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_quote_requests_check on app.quote_requests for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_quote_results_check on app.quote_results for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_shipments_check on app.shipments for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_shipment_packages_check on app.shipment_packages for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_tracking_events_check on app.tracking_events for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_sync_jobs_check on app.sync_jobs for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_webhook_logs_check on app.webhook_logs for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_audit_logs_check on app.audit_logs for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_freight_tables_check on app.freight_tables for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_freight_versions_check on app.freight_table_versions for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_freight_routes_check on app.freight_routes for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_freight_recipient_fees_check on app.freight_recipient_fees for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_shipping_rules_check on app.shipping_rules for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
create policy p_files_check on app.files for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());

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
