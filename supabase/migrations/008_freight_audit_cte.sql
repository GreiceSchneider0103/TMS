-- 008: download de planilhas, produtos por empresa, auditoria de frete com CT-e

-- 1) Planilhas de frete: guardar o arquivo original para permitir download.
alter table app.files add column if not exists content bytea;

-- 2) Produtos por empresa (SKU passa a ser único por empresa).
alter table app.products add column if not exists company_id uuid references app.companies(id);
alter table app.products drop constraint if exists products_account_id_sku_internal_key;
create unique index if not exists ux_products_account_company_sku
  on app.products(account_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), sku_internal)
  where deleted_at is null;
create index if not exists idx_products_company on app.products(company_id);

-- Transportadora: CNPJ para vincular CT-es automaticamente.
alter table app.carriers add column if not exists cnpj text;

-- 3) Certificado digital A1 por empresa (conteúdo e senha criptografados pela API com AES-256-GCM).
create table if not exists app.company_certificates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  company_id uuid not null references app.companies(id) on delete cascade,
  pfx_encrypted text not null,
  password_encrypted text not null,
  subject text,
  cnpj text,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, company_id)
);

-- Controle da distribuição de DF-e (último NSU consultado na SEFAZ por empresa).
create table if not exists app.sefaz_dist_state (
  account_id uuid not null references app.accounts(id) on delete cascade,
  company_id uuid not null references app.companies(id) on delete cascade,
  environment text not null default 'producao',
  ult_nsu text not null default '000000000000000',
  max_nsu text,
  last_status text,
  last_message text,
  last_run_at timestamptz,
  next_allowed_at timestamptz,
  primary key (account_id, company_id, environment)
);

-- 4) CT-es recebidos (SEFAZ ou upload de XML).
create table if not exists app.ctes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  company_id uuid references app.companies(id),
  chave text not null,
  numero text,
  serie text,
  data_emissao timestamptz,
  emitente_cnpj text,
  emitente_nome text,
  tomador_cnpj text,
  remetente_cnpj text,
  destinatario_documento text,
  destinatario_nome text,
  destino_uf text,
  destino_cidade text,
  valor_prestacao numeric(14,2),
  valor_receber numeric(14,2),
  nfe_chaves text[] not null default '{}',
  carrier_id uuid references app.carriers(id),
  shipment_id uuid references app.shipments(id) on delete set null,
  match_method text,
  source text not null default 'upload',
  nsu text,
  xml text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, chave)
);
create index if not exists idx_ctes_account_shipment on app.ctes(account_id, shipment_id);
create index if not exists idx_ctes_account_emissao on app.ctes(account_id, data_emissao desc);

alter table app.company_certificates enable row level security;
alter table app.company_certificates force row level security;
create policy p_company_certificates on app.company_certificates for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());

alter table app.sefaz_dist_state enable row level security;
alter table app.sefaz_dist_state force row level security;
create policy p_sefaz_dist_state on app.sefaz_dist_state for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());

alter table app.ctes enable row level security;
alter table app.ctes force row level security;
create policy p_ctes on app.ctes for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
