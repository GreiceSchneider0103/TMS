-- Incremental migration: close operational gaps for V1
create extension if not exists pgcrypto;

create table if not exists app.memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app.user_role not null,
  created_at timestamptz not null default now(),
  unique(account_id, user_id)
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
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(account_id, provider, event_key)
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

alter table app.quote_requests add column if not exists request_hash text;
alter table app.quote_results add column if not exists selected boolean not null default false;
alter table app.orders add column if not exists shipping_amount numeric(14,2) default 0;
alter table app.tracking_events add column if not exists external_event_id text;
alter table app.sync_jobs add column if not exists external_ref text;

create unique index if not exists uq_quote_requests_hash on app.quote_requests(account_id, request_hash) where request_hash is not null;
create unique index if not exists uq_tracking_external_event on app.tracking_events(account_id, shipment_id, external_event_id) where external_event_id is not null;
create index if not exists idx_webhook_logs_account_received on app.webhook_logs(account_id, received_at desc);
create index if not exists idx_files_account_created on app.files(account_id, created_at desc);
create index if not exists idx_shipment_packages_shipment on app.shipment_packages(shipment_id);
create index if not exists idx_sync_jobs_status_attempts on app.sync_jobs(status, attempts);

alter table app.memberships enable row level security;
alter table app.shipment_packages enable row level security;
alter table app.freight_recipient_fees enable row level security;
alter table app.webhook_logs enable row level security;
alter table app.files enable row level security;

create policy p_account_isolation_memberships on app.memberships using (account_id = app.current_account_id());
create policy p_account_isolation_shipment_packages on app.shipment_packages using (account_id = app.current_account_id());
create policy p_account_isolation_freight_recipient_fees on app.freight_recipient_fees using (account_id = app.current_account_id());
create policy p_account_isolation_webhook_logs on app.webhook_logs using (account_id = app.current_account_id());
create policy p_account_isolation_files on app.files using (account_id = app.current_account_id());

create or replace function app.rollback_freight_table_version(p_version_id uuid)
returns void language plpgsql as $$
declare
  v_table_id uuid;
begin
  select table_id into v_table_id from app.freight_table_versions where id = p_version_id;
  if v_table_id is null then
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
