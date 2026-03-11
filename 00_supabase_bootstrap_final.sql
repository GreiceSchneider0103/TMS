-- 00_supabase_bootstrap.sql
-- Bootstrap único e consolidado para Supabase SQL Editor
-- Compatível com execução repetida (idempotente) sempre que possível.
-- Observação: CREATE POLICY não possui IF NOT EXISTS nativo, por isso usamos DO $$ com verificação em pg_policies.

create extension if not exists pgcrypto;

create schema if not exists app;

-- =========================
-- TYPES / ENUMS
-- =========================
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'app' and t.typname = 'user_role') then
    create type app.user_role as enum ('admin','operador','financeiro','integracao','visualizador');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'app' and t.typname = 'order_status') then
    create type app.order_status as enum ('CREATED','READY_FOR_QUOTE','QUOTED','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','EXCEPTION','RETURNED','CANCELED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'app' and t.typname = 'shipment_status') then
    create type app.shipment_status as enum ('CREATED','QUOTED','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','EXCEPTION','RETURNED','CANCELED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'app' and t.typname = 'table_version_status') then
    create type app.table_version_status as enum ('DRAFT','PUBLISHED','ARCHIVED');
  end if;
end $$;

-- =========================
-- FUNCTIONS (helpers)
-- =========================
create or replace function app.sha256_text(input text)
returns text
language sql
immutable
as $$
  select encode(digest(input, 'sha256'), 'hex');
$$;

create or replace function app.current_account_id()
returns uuid
language sql
stable
as $$
  select p.account_id
  from app.profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;

create or replace function app.publish_freight_table_version(p_version_id uuid)
returns void
language plpgsql
as $$
declare
  v_table_id uuid;
  v_account uuid;
begin
  select table_id, account_id into v_table_id, v_account
  from app.freight_table_versions
  where id = p_version_id;

  if v_account is null then
    raise exception 'Version not found';
  end if;

  update app.freight_table_versions
    set status = 'ARCHIVED'
  where table_id = v_table_id
    and status = 'PUBLISHED';

  update app.freight_table_versions
    set status = 'PUBLISHED', published_at = now()
  where id = p_version_id;
end;
$$;

create or replace function app.rollback_freight_table_version(p_version_id uuid)
returns void
language plpgsql
as $$
declare
  v_table_id uuid;
begin
  select table_id into v_table_id
  from app.freight_table_versions
  where id = p_version_id;

  if v_table_id is null then
    raise exception 'Version not found';
  end if;

  update app.freight_table_versions
    set status = 'ARCHIVED'
  where table_id = v_table_id
    and status = 'PUBLISHED';

  update app.freight_table_versions
    set status = 'PUBLISHED', published_at = now()
  where id = p_version_id;
end;
$$;

-- =========================
-- TABLES
-- =========================
create table if not exists app.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists app.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null references app.accounts(id) on delete cascade,
  full_name text,
  role app.user_role not null default 'visualizador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app.user_role not null,
  created_at timestamptz not null default now(),
  unique(account_id, user_id)
);

create table if not exists app.companies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  cnpj text not null,
  trade_name text not null,
  legal_name text not null,
  postal_code text not null,
  city text not null,
  state text not null,
  address_line text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.distribution_centers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  company_id uuid not null references app.companies(id) on delete cascade,
  name text not null,
  postal_code text not null,
  city text not null,
  state text not null,
  address_line text not null,
  operating_hours jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.carriers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  name text not null,
  external_name text,
  priority int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.carrier_services (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references app.carriers(id) on delete cascade,
  account_id uuid not null references app.accounts(id) on delete cascade,
  name text not null,
  sla_days int not null default 5,
  constraints jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists app.products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  sku_internal text not null,
  sku_external text,
  name text not null,
  category text,
  created_at timestamptz not null default now(),
  unique(account_id, sku_internal)
);

create table if not exists app.product_logistics (
  product_id uuid primary key references app.products(id) on delete cascade,
  account_id uuid not null references app.accounts(id) on delete cascade,
  weight_kg numeric(10,3) not null,
  length_cm numeric(10,2) not null,
  width_cm numeric(10,2) not null,
  height_cm numeric(10,2) not null,
  cubing_factor numeric(10,2) not null default 300,
  classification text,
  restrictions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists app.recipients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  document text not null,
  legal_name text not null,
  type text not null check (type in ('PF','PJ')),
  postal_code text not null,
  city text not null,
  state text not null,
  address_line text not null,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  external_id text not null,
  order_number text not null,
  channel text not null,
  recipient_id uuid references app.recipients(id),
  total_amount numeric(14,2) not null,
  invoice_amount numeric(14,2),
  shipping_amount numeric(14,2) default 0,
  status app.order_status not null default 'CREATED',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, external_id)
);

create table if not exists app.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders(id) on delete cascade,
  account_id uuid not null references app.accounts(id) on delete cascade,
  product_id uuid references app.products(id),
  sku text not null,
  qty int not null,
  unit_price numeric(14,2) not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists app.freight_tables (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  name text not null,
  carrier_id uuid references app.carriers(id),
  created_at timestamptz not null default now()
);

create table if not exists app.freight_table_versions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references app.freight_tables(id) on delete cascade,
  account_id uuid not null references app.accounts(id) on delete cascade,
  version_label text not null,
  status app.table_version_status not null default 'DRAFT',
  valid_from date,
  valid_to date,
  raw_file_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists app.freight_routes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references app.freight_table_versions(id) on delete cascade,
  account_id uuid not null references app.accounts(id) on delete cascade,
  cep_start text not null,
  cep_end text not null,
  state text,
  city text,
  min_weight numeric(10,3) not null,
  max_weight numeric(10,3) not null,
  base_amount numeric(14,2) not null,
  extra_per_kg numeric(14,2) not null default 0,
  min_freight numeric(14,2) not null default 0,
  ad_valorem_pct numeric(8,4) not null default 0,
  gris_pct numeric(8,4) not null default 0,
  trt_amount numeric(14,2) not null default 0,
  tda_amount numeric(14,2) not null default 0,
  cubing_factor numeric(10,2) not null default 300,
  sla_days int not null default 7,
  restrictions jsonb not null default '{}'::jsonb
);

create table if not exists app.freight_recipient_fees (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  version_id uuid not null references app.freight_table_versions(id) on delete cascade,
  recipient_document text not null,
  fee_type text not null,
  amount numeric(14,2) not null default 0,
  min_amount numeric(14,2),
  max_amount numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app.shipping_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  name text not null,
  description text,
  priority int not null default 100,
  active boolean not null default true,
  valid_from date,
  valid_to date,
  conditions jsonb not null,
  actions jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists app.quote_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  order_id uuid references app.orders(id),
  origin_dc_id uuid references app.distribution_centers(id),
  destination_postal_code text not null,
  invoice_amount numeric(14,2) not null,
  payload jsonb not null default '{}'::jsonb,
  request_hash text,
  created_at timestamptz not null default now()
);

create table if not exists app.quote_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references app.quote_requests(id) on delete cascade,
  account_id uuid not null references app.accounts(id) on delete cascade,
  carrier_id uuid references app.carriers(id),
  carrier_service_id uuid references app.carrier_services(id),
  total_amount numeric(14,2) not null,
  total_days int not null,
  ranking int not null,
  breakdown jsonb not null,
  applied_rules jsonb not null default '[]'::jsonb,
  selected boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists app.shipments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  order_id uuid not null references app.orders(id) on delete cascade,
  quote_result_id uuid references app.quote_results(id),
  carrier_id uuid references app.carriers(id),
  carrier_service_id uuid references app.carrier_services(id),
  tracking_code text,
  invoice_number text,
  cte_number text,
  idempotency_key text,
  status app.shipment_status not null default 'CREATED',
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.shipment_packages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  shipment_id uuid not null references app.shipments(id) on delete cascade,
  package_number int not null,
  weight_kg numeric(10,3) not null,
  length_cm numeric(10,2),
  width_cm numeric(10,2),
  height_cm numeric(10,2),
  volume_m3 numeric(10,5),
  tracking_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(shipment_id, package_number)
);

create table if not exists app.tracking_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  shipment_id uuid not null references app.shipments(id) on delete cascade,
  occurred_at timestamptz not null,
  external_status text not null,
  macro_status app.shipment_status not null,
  raw_payload jsonb not null,
  external_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists app.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  provider text not null,
  event_key text,
  event_type text,
  status text not null default 'received',
  payload jsonb not null,
  response jsonb,
  error text,
  correlation_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(account_id, provider, event_key)
);

create table if not exists app.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  kind text not null,
  status text not null,
  attempts int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  response jsonb,
  error text,
  external_ref text,
  idempotency_key text,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.files (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  byte_size bigint,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(account_id, storage_bucket, storage_path)
);

create table if not exists app.audit_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  actor_user_id uuid,
  entity text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  context jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

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

-- =========================
-- INDEXES / IDEMPOTENCY
-- =========================
create index if not exists idx_orders_account_status on app.orders(account_id, status);
create index if not exists idx_shipments_account_status on app.shipments(account_id, status);
create index if not exists idx_tracking_shipment_date on app.tracking_events(shipment_id, occurred_at desc);
create index if not exists idx_routes_version_cep on app.freight_routes(version_id, cep_start, cep_end);
create index if not exists idx_audit_logs_account_created on app.audit_logs(account_id, created_at desc);
create index if not exists idx_webhook_logs_account_received on app.webhook_logs(account_id, received_at desc);
create index if not exists idx_files_account_created on app.files(account_id, created_at desc);
create index if not exists idx_shipment_packages_shipment on app.shipment_packages(shipment_id);
create index if not exists idx_sync_jobs_status_attempts on app.sync_jobs(status, attempts);

create unique index if not exists uq_quote_requests_hash on app.quote_requests(account_id, request_hash) where request_hash is not null;
create unique index if not exists uq_tracking_external_event on app.tracking_events(account_id, shipment_id, external_event_id) where external_event_id is not null;
create unique index if not exists uq_sync_jobs_idempotency on app.sync_jobs(account_id, kind, idempotency_key) where idempotency_key is not null;
create unique index if not exists uq_shipments_idempotency on app.shipments(account_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists uq_shipments_order_quote on app.shipments(account_id, order_id, quote_result_id) where quote_result_id is not null;

-- =========================
-- RLS ENABLE
-- =========================
alter table app.accounts enable row level security;
alter table app.profiles enable row level security;
alter table app.memberships enable row level security;
alter table app.companies enable row level security;
alter table app.distribution_centers enable row level security;
alter table app.carriers enable row level security;
alter table app.carrier_services enable row level security;
alter table app.products enable row level security;
alter table app.product_logistics enable row level security;
alter table app.recipients enable row level security;
alter table app.orders enable row level security;
alter table app.order_items enable row level security;
alter table app.freight_tables enable row level security;
alter table app.freight_table_versions enable row level security;
alter table app.freight_routes enable row level security;
alter table app.freight_recipient_fees enable row level security;
alter table app.shipping_rules enable row level security;
alter table app.quote_requests enable row level security;
alter table app.quote_results enable row level security;
alter table app.shipments enable row level security;
alter table app.shipment_packages enable row level security;
alter table app.tracking_events enable row level security;
alter table app.webhook_logs enable row level security;
alter table app.sync_jobs enable row level security;
alter table app.files enable row level security;
alter table app.audit_logs enable row level security;
alter table app.api_credentials enable row level security;

-- =========================
-- POLICIES (idempotentes via DO)
-- =========================
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='profiles' and policyname='p_account_isolation_profiles') then
    create policy p_account_isolation_profiles on app.profiles using (account_id = app.current_account_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='app' and tablename='memberships' and policyname='p_account_isolation_memberships') then
    create policy p_account_isolation_memberships on app.memberships using (account_id = app.current_account_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='app' and tablename='companies' and policyname='p_account_isolation_companies') then
    create policy p_account_isolation_companies on app.companies using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='distribution_centers' and policyname='p_account_isolation_distribution_centers') then
    create policy p_account_isolation_distribution_centers on app.distribution_centers using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='carriers' and policyname='p_account_isolation_carriers') then
    create policy p_account_isolation_carriers on app.carriers using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='carrier_services' and policyname='p_account_isolation_carrier_services') then
    create policy p_account_isolation_carrier_services on app.carrier_services using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='products' and policyname='p_account_isolation_products') then
    create policy p_account_isolation_products on app.products using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='product_logistics' and policyname='p_account_isolation_product_logistics') then
    create policy p_account_isolation_product_logistics on app.product_logistics using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='recipients' and policyname='p_account_isolation_recipients') then
    create policy p_account_isolation_recipients on app.recipients using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='orders' and policyname='p_account_isolation_orders') then
    create policy p_account_isolation_orders on app.orders using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='order_items' and policyname='p_account_isolation_order_items') then
    create policy p_account_isolation_order_items on app.order_items using (account_id = app.current_account_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='app' and tablename='freight_tables' and policyname='p_account_isolation_freight_tables') then
    create policy p_account_isolation_freight_tables on app.freight_tables using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='freight_table_versions' and policyname='p_account_isolation_freight_table_versions') then
    create policy p_account_isolation_freight_table_versions on app.freight_table_versions using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='freight_routes' and policyname='p_account_isolation_freight_routes') then
    create policy p_account_isolation_freight_routes on app.freight_routes using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='freight_recipient_fees' and policyname='p_account_isolation_freight_recipient_fees') then
    create policy p_account_isolation_freight_recipient_fees on app.freight_recipient_fees using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='shipping_rules' and policyname='p_account_isolation_shipping_rules') then
    create policy p_account_isolation_shipping_rules on app.shipping_rules using (account_id = app.current_account_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='app' and tablename='quote_requests' and policyname='p_account_isolation_quote_requests') then
    create policy p_account_isolation_quote_requests on app.quote_requests using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='quote_results' and policyname='p_account_isolation_quote_results') then
    create policy p_account_isolation_quote_results on app.quote_results using (account_id = app.current_account_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='app' and tablename='shipments' and policyname='p_account_isolation_shipments') then
    create policy p_account_isolation_shipments on app.shipments using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='shipment_packages' and policyname='p_account_isolation_shipment_packages') then
    create policy p_account_isolation_shipment_packages on app.shipment_packages using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='tracking_events' and policyname='p_account_isolation_tracking_events') then
    create policy p_account_isolation_tracking_events on app.tracking_events using (account_id = app.current_account_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='app' and tablename='webhook_logs' and policyname='p_account_isolation_webhook_logs') then
    create policy p_account_isolation_webhook_logs on app.webhook_logs using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='sync_jobs' and policyname='p_account_isolation_sync_jobs') then
    create policy p_account_isolation_sync_jobs on app.sync_jobs using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='files' and policyname='p_account_isolation_files') then
    create policy p_account_isolation_files on app.files using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='audit_logs' and policyname='p_account_isolation_audit_logs') then
    create policy p_account_isolation_audit_logs on app.audit_logs using (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='api_credentials' and policyname='p_account_isolation_api_credentials') then
    create policy p_account_isolation_api_credentials on app.api_credentials using (account_id = app.current_account_id());
  end if;

  -- Policies explícitas WITH CHECK nas tabelas críticas (hardening)
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='orders' and policyname='p_orders_check') then
    create policy p_orders_check on app.orders for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='order_items' and policyname='p_order_items_check') then
    create policy p_order_items_check on app.order_items for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='quote_requests' and policyname='p_quote_requests_check') then
    create policy p_quote_requests_check on app.quote_requests for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='quote_results' and policyname='p_quote_results_check') then
    create policy p_quote_results_check on app.quote_results for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='shipments' and policyname='p_shipments_check') then
    create policy p_shipments_check on app.shipments for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='shipment_packages' and policyname='p_shipment_packages_check') then
    create policy p_shipment_packages_check on app.shipment_packages for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='tracking_events' and policyname='p_tracking_events_check') then
    create policy p_tracking_events_check on app.tracking_events for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='sync_jobs' and policyname='p_sync_jobs_check') then
    create policy p_sync_jobs_check on app.sync_jobs for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='webhook_logs' and policyname='p_webhook_logs_check') then
    create policy p_webhook_logs_check on app.webhook_logs for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='audit_logs' and policyname='p_audit_logs_check') then
    create policy p_audit_logs_check on app.audit_logs for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='freight_tables' and policyname='p_freight_tables_check') then
    create policy p_freight_tables_check on app.freight_tables for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='freight_table_versions' and policyname='p_freight_versions_check') then
    create policy p_freight_versions_check on app.freight_table_versions for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='freight_routes' and policyname='p_freight_routes_check') then
    create policy p_freight_routes_check on app.freight_routes for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='freight_recipient_fees' and policyname='p_freight_recipient_fees_check') then
    create policy p_freight_recipient_fees_check on app.freight_recipient_fees for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='shipping_rules' and policyname='p_shipping_rules_check') then
    create policy p_shipping_rules_check on app.shipping_rules for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='app' and tablename='files' and policyname='p_files_check') then
    create policy p_files_check on app.files for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
  end if;
end $$;

-- =========================
-- FORCE RLS (hardening)
-- =========================
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

-- opcional hardening adicional:
alter table app.api_credentials force row level security;



-- =========================
-- CONSOLIDATED RUNTIME+GRANTS PATCH (from 04/05)
-- =========================

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



-- 05_supabase_roles_grants_patch.sql
-- Patch de grants/roles para Supabase + API runtime
-- IMPORTANTE:
-- 1) Este patch NÃO cria roles customizadas (nem sempre permitido no SQL Editor).
-- 2) O runtime seguro assume conexão com role sem BYPASSRLS.
-- 3) Evite usar superuser/owner no runtime da API.

-- Schema usage
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- Tabelas: remover acesso aberto e conceder mínimo necessário
revoke all on all tables in schema app from public;
grant select, insert, update, delete on all tables in schema app to authenticated, service_role;

-- Sequences
revoke all on all sequences in schema app from public;
grant usage, select on all sequences in schema app to authenticated, service_role;

-- Functions
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- Defaults para objetos futuros
alter default privileges in schema app revoke all on tables from public;
alter default privileges in schema app grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema app revoke all on sequences from public;
alter default privileges in schema app grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema app revoke all on functions from public;
alter default privileges in schema app grant execute on functions to authenticated, service_role;

-- Hardening adicional para api_credentials:
-- consumo de autenticação deve ocorrer pela função SECURITY DEFINER app.authenticate_api_key.
revoke all on table app.api_credentials from anon;
revoke all on table app.api_credentials from authenticated;

-- service_role mantém acesso administrativo completo quando necessário.
grant select, insert, update, delete on table app.api_credentials to service_role;

-- Verificação rápida de grants e owners
select n.nspname as schema_name, c.relname as table_name, pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'app' and c.relkind = 'r'
order by c.relname;

