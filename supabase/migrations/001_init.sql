-- TMS Lessul V1 - Schema base
create extension if not exists pgcrypto;

create schema if not exists app;

create type app.user_role as enum ('admin','operador','financeiro','integracao','visualizador');
create type app.order_status as enum ('CREATED','READY_FOR_QUOTE','QUOTED','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','EXCEPTION','RETURNED','CANCELED');
create type app.shipment_status as enum ('CREATED','QUOTED','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','EXCEPTION','RETURNED','CANCELED');
create type app.table_version_status as enum ('DRAFT','PUBLISHED','ARCHIVED');

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
  status app.shipment_status not null default 'CREATED',
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.tracking_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  shipment_id uuid not null references app.shipments(id) on delete cascade,
  occurred_at timestamptz not null,
  external_status text not null,
  macro_status app.shipment_status not null,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_account_status on app.orders(account_id, status);
create index if not exists idx_shipments_account_status on app.shipments(account_id, status);
create index if not exists idx_tracking_shipment_date on app.tracking_events(shipment_id, occurred_at desc);
create index if not exists idx_routes_version_cep on app.freight_routes(version_id, cep_start, cep_end);
create index if not exists idx_audit_logs_account_created on app.audit_logs(account_id, created_at desc);

create or replace function app.current_account_id()
returns uuid language sql stable as $$
  select account_id from app.profiles where user_id = auth.uid();
$$;

alter table app.accounts enable row level security;
alter table app.profiles enable row level security;
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
alter table app.shipping_rules enable row level security;
alter table app.quote_requests enable row level security;
alter table app.quote_results enable row level security;
alter table app.shipments enable row level security;
alter table app.tracking_events enable row level security;
alter table app.sync_jobs enable row level security;
alter table app.audit_logs enable row level security;

create policy p_account_isolation_profiles on app.profiles using (account_id = app.current_account_id());

create policy p_account_isolation_companies on app.companies using (account_id = app.current_account_id());
create policy p_account_isolation_distribution_centers on app.distribution_centers using (account_id = app.current_account_id());
create policy p_account_isolation_carriers on app.carriers using (account_id = app.current_account_id());
create policy p_account_isolation_carrier_services on app.carrier_services using (account_id = app.current_account_id());
create policy p_account_isolation_products on app.products using (account_id = app.current_account_id());
create policy p_account_isolation_product_logistics on app.product_logistics using (account_id = app.current_account_id());
create policy p_account_isolation_recipients on app.recipients using (account_id = app.current_account_id());
create policy p_account_isolation_orders on app.orders using (account_id = app.current_account_id());
create policy p_account_isolation_order_items on app.order_items using (account_id = app.current_account_id());
create policy p_account_isolation_freight_tables on app.freight_tables using (account_id = app.current_account_id());
create policy p_account_isolation_freight_table_versions on app.freight_table_versions using (account_id = app.current_account_id());
create policy p_account_isolation_freight_routes on app.freight_routes using (account_id = app.current_account_id());
create policy p_account_isolation_shipping_rules on app.shipping_rules using (account_id = app.current_account_id());
create policy p_account_isolation_quote_requests on app.quote_requests using (account_id = app.current_account_id());
create policy p_account_isolation_quote_results on app.quote_results using (account_id = app.current_account_id());
create policy p_account_isolation_shipments on app.shipments using (account_id = app.current_account_id());
create policy p_account_isolation_tracking_events on app.tracking_events using (account_id = app.current_account_id());
create policy p_account_isolation_sync_jobs on app.sync_jobs using (account_id = app.current_account_id());
create policy p_account_isolation_audit_logs on app.audit_logs using (account_id = app.current_account_id());

create or replace function app.publish_freight_table_version(p_version_id uuid)
returns void language plpgsql as $$
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
  where table_id = v_table_id and status = 'PUBLISHED';

  update app.freight_table_versions
    set status = 'PUBLISHED', published_at = now()
  where id = p_version_id;
end;
$$;
