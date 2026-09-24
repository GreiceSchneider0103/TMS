-- 009: notas fiscais por pedido (venda e remessa/triangulação) e controle de tarefas agendadas

-- Um pedido pode ter mais de uma NF-e: a NF de venda e, quando o CD fica em outro estado
-- (triangulação / venda à ordem), a NF de remessa que é a efetivamente transportada no CT-e.
create table if not exists app.order_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  order_id uuid references app.orders(id) on delete set null,
  kind text not null default 'venda' check (kind in ('venda', 'remessa', 'outra')),
  chave text not null,
  numero text,
  serie text,
  data_emissao timestamptz,
  emitente_cnpj text,
  emitente_nome text,
  emitente_uf text,
  destinatario_documento text,
  destinatario_nome text,
  destino_uf text,
  valor_total numeric(14,2),
  valor_produtos numeric(14,2),
  cfop text,
  pedido_referencia text,
  referenced_keys text[] not null default '{}',
  source text not null default 'upload',
  shopee_sent_at timestamptz,
  xml text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, chave)
);
create index if not exists idx_order_invoices_order on app.order_invoices(account_id, order_id);
create index if not exists idx_order_invoices_refs on app.order_invoices using gin(referenced_keys);
create index if not exists idx_ctes_nfe_chaves on app.ctes using gin(nfe_chaves);

alter table app.order_invoices enable row level security;
alter table app.order_invoices force row level security;
create policy p_order_invoices on app.order_invoices for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());

-- Controle das tarefas agendadas (ex.: busca de CT-es na SEFAZ 2x ao dia). Uso interno da API.
create table if not exists app.scheduled_jobs (
  job text primary key,
  last_slot text,
  last_run_at timestamptz,
  last_result jsonb
);
alter table app.scheduled_jobs enable row level security;
