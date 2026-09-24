-- Integração com ERPs (Tiny API v3 via OAuth2). Um registro por conta e provedor.
create table if not exists app.erp_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  provider text not null check (provider in ('tiny')),
  client_id text,
  client_secret_encrypted text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  oauth_state text,
  oauth_state_expires_at timestamptz,
  webhook_token text not null default replace(gen_random_uuid()::text, '-', ''),
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'pendente' check (status in ('pendente','conectado','erro','desconectado')),
  last_error text,
  connected_at timestamptz,
  last_order_sync_at timestamptz,
  last_product_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider)
);
create unique index if not exists erp_connections_webhook_token_idx on app.erp_connections(webhook_token);
create unique index if not exists erp_connections_oauth_state_idx on app.erp_connections(oauth_state) where oauth_state is not null;

alter table app.erp_connections enable row level security;
drop policy if exists erp_connections_tenant on app.erp_connections;
create policy erp_connections_tenant on app.erp_connections
  using (account_id = app.current_account_id())
  with check (account_id = app.current_account_id());
