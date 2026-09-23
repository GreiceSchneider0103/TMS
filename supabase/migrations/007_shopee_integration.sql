-- Shopee Open Platform integration: OAuth-connected shops per account

create table if not exists app.shopee_shops (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.accounts(id) on delete cascade,
  shop_id text not null,
  partner_id text not null,
  shop_name text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  is_sandbox boolean not null default false,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, shop_id)
);

alter table app.shopee_shops enable row level security;
alter table app.shopee_shops force row level security;
create policy p_shopee_shops_check on app.shopee_shops for all using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());

create index if not exists idx_shopee_shops_account on app.shopee_shops(account_id);
