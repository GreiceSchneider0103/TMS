-- 010: de-para de transportadoras, pendências de integração, datas/prazos e histórico de importações

-- 1) De-para: nome/serviço que chega do marketplace ou ERP -> transportadora/serviço do TMS.
create table if not exists app.carrier_mappings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  source_name text not null,
  source_service text,
  channel text,
  carrier_id uuid references app.carriers(id),
  carrier_service_id uuid references app.carrier_services(id),
  ignore_integration boolean not null default false,
  ignore_cost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_carrier_mappings_key
  on app.carrier_mappings(account_id, lower(source_name), coalesce(lower(source_service), ''), coalesce(channel, ''));
alter table app.carrier_mappings enable row level security;
alter table app.carrier_mappings force row level security;
create policy p_carrier_mappings on app.carrier_mappings for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());

-- 2) Pendências de integração com motivo (CEP inválido, transportadora não mapeada, sem cotação...).
create table if not exists app.integration_issues (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  source text not null,
  reason text not null,
  message text,
  order_id uuid references app.orders(id) on delete cascade,
  external_ref text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'aberto' check (status in ('aberto', 'resolvido', 'descartado')),
  attempts integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists ux_integration_issues_open
  on app.integration_issues(account_id, source, reason, coalesce(external_ref, '')) where status = 'aberto';
create index if not exists idx_integration_issues_account on app.integration_issues(account_id, status, last_seen_at desc);
alter table app.integration_issues enable row level security;
alter table app.integration_issues force row level security;
create policy p_integration_issues on app.integration_issues for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());

-- 3) Datas e prazos.
alter table app.orders add column if not exists sold_at timestamptz;
alter table app.orders add column if not exists ship_by_date timestamptz;          -- prazo de expedição (postar até)
alter table app.orders add column if not exists promised_delivery_date date;       -- data prometida ao cliente
alter table app.orders add column if not exists marketplace_carrier text;          -- transportadora informada pelo canal
alter table app.orders add column if not exists marketplace_service text;
alter table app.orders add column if not exists integration_ignored boolean not null default false;
alter table app.orders add column if not exists ignore_cost boolean not null default false;

alter table app.shipments add column if not exists estimated_delivery_date date;   -- previsão da transportadora
alter table app.shipments add column if not exists transit_days integer;           -- prazo de transporte (dias úteis)
alter table app.shipments add column if not exists delivered_to text;              -- recebedor
alter table app.shipments add column if not exists delivery_notes text;
alter table app.shipments add column if not exists tracking_source text not null default 'api'; -- api | manual
alter table app.shipments add column if not exists freight_amount numeric(14,2);     -- frete contratado informado no despacho manual

-- 4) Histórico de importações por planilha.
create table if not exists app.import_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  kind text not null,
  file_name text,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_import_jobs_account on app.import_jobs(account_id, kind, created_at desc);
alter table app.import_jobs enable row level security;
alter table app.import_jobs force row level security;
create policy p_import_jobs on app.import_jobs for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
