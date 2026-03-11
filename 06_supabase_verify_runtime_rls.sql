-- 06_supabase_verify_runtime_rls.sql
-- Verificação final do patch runtime + RLS

-- 1) Funções de contexto/runtime
select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app'
  and p.proname in (
    'current_account_id',
    'rls_account_id',
    'authenticate_api_key',
    'touch_api_credential',
    'publish_freight_table_version',
    'rollback_freight_table_version'
  )
order by p.proname;

-- 2) Garantir que current_account_id não depende só de auth.uid
select pg_get_functiondef('app.current_account_id()'::regprocedure) as current_account_id_definition;
select pg_get_functiondef('app.rls_account_id()'::regprocedure) as rls_account_id_definition;

-- 3) Policies críticas padronizadas
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'app'
  and tablename in (
    'orders','order_items','quote_requests','quote_results','shipments','shipment_packages',
    'tracking_events','sync_jobs','webhook_logs','audit_logs','freight_tables',
    'freight_table_versions','freight_routes','freight_recipient_fees','shipping_rules','files','api_credentials'
  )
order by tablename, policyname;

-- 4) FORCE RLS ativo
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='app'
  and c.relkind='r'
  and c.relname in (
    'orders','order_items','quote_requests','quote_results','shipments','shipment_packages',
    'tracking_events','sync_jobs','webhook_logs','audit_logs','freight_tables',
    'freight_table_versions','freight_routes','freight_recipient_fees','shipping_rules','files','api_credentials'
  )
order by c.relname;

-- 5) Grants de schema/tabelas/funções
select n.nspname as schema_name, c.relname as object_name, c.relkind, c.relacl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='app'
  and c.relkind in ('r','v','S')
order by c.relkind, c.relname;

-- 6) Dependência indevida de auth.uid() (inspeção textual em funções app)
select p.proname, position('auth.uid' in pg_get_functiondef(p.oid)) > 0 as contains_auth_uid
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='app'
order by p.proname;

-- 7) Tabelas principais existem
select table_name
from information_schema.tables
where table_schema='app'
  and table_name in (
    'orders','order_items','quote_requests','quote_results','shipments','shipment_packages',
    'tracking_events','sync_jobs','webhook_logs','audit_logs','freight_tables','freight_table_versions',
    'freight_routes','freight_recipient_fees','shipping_rules','files','api_credentials'
  )
order by table_name;

