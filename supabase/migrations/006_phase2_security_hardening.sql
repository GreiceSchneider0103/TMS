-- Phase 2 hardening: RLS, grants, and performance indexes

-- Ensure account resolution uses session context first
create or replace function app.current_account_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_account_id', true), '')::uuid
  union all
  select account_id from app.profiles where user_id = auth.uid()
  limit 1;
$$;

-- Enable and force RLS on all app tables
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'app'
  LOOP
    EXECUTE format('alter table app.%I enable row level security', t.tablename);
    EXECUTE format('alter table app.%I force row level security', t.tablename);
  END LOOP;
END $$;

-- Harden grants: no anon table access, minimal authenticated surface
revoke all on schema app from anon;
revoke all on schema app from authenticated;
grant usage on schema app to authenticated;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'app'
  LOOP
    EXECUTE format('revoke all on table app.%I from anon', t.tablename);
    EXECUTE format('revoke all on table app.%I from authenticated', t.tablename);
  END LOOP;
END $$;

-- Keep API-key auth functions callable by API surface
revoke all on function app.authenticate_api_key(text) from public;
revoke all on function app.touch_api_credential(uuid) from public;
grant execute on function app.authenticate_api_key(text) to authenticated, service_role;
grant execute on function app.touch_api_credential(uuid) to authenticated, service_role;

-- account_id and composite indexes for multi-tenant queries
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'app'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name = 'account_id'
  LOOP
    EXECUTE format('create index if not exists idx_%I_account_id on app.%I(account_id)', r.table_name, r.table_name);

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = r.table_name AND column_name = 'status'
    ) THEN
      EXECUTE format('create index if not exists idx_%I_account_status on app.%I(account_id, status)', r.table_name, r.table_name);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = r.table_name AND column_name = 'created_at'
    ) THEN
      EXECUTE format('create index if not exists idx_%I_account_created_at on app.%I(account_id, created_at desc)', r.table_name, r.table_name);
    END IF;
  END LOOP;
END $$;
