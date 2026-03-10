-- 03_supabase_verify_final.sql
-- Verificação final consolidada de estrutura + runtime RLS + grants + seed

-- 1) Tabelas do domínio app
select table_name
from information_schema.tables
where table_schema = 'app'
order by table_name;

-- 2) Funções críticas (schema, runtime, auth, rpc)
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
    'rollback_freight_table_version',
    'sha256_text'
  )
order by p.proname;

-- 3) Definição das funções de contexto (validar runtime)
select pg_get_functiondef('app.current_account_id()'::regprocedure) as current_account_id_definition;
select pg_get_functiondef('app.rls_account_id()'::regprocedure) as rls_account_id_definition;

-- 4) Índices críticos (idempotência/operacional)
select schemaname, tablename, indexname
from pg_indexes
where schemaname = 'app'
  and indexname in (
    'uq_quote_requests_hash',
    'uq_tracking_external_event',
    'uq_sync_jobs_idempotency',
    'uq_shipments_idempotency',
    'uq_shipments_order_quote',
    'idx_orders_account_status',
    'idx_shipments_account_status',
    'idx_routes_version_cep'
  )
order by tablename, indexname;

-- 5) Policies críticas
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'app'
order by tablename, policyname;

-- 6) RLS e FORCE RLS
select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'app'
  and c.relkind = 'r'
order by c.relname;

-- 7) Grants/ACL (objetos app)
select n.nspname as schema_name, c.relname as object_name, c.relkind, c.relacl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='app'
  and c.relkind in ('r','v','S')
order by c.relkind, c.relname;

-- 8) Dependência textual de auth.uid nas funções app (não deve ser exclusiva)
select p.proname,
       position('auth.uid' in pg_get_functiondef(p.oid)) > 0 as contains_auth_uid
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='app'
order by p.proname;

-- 9) Seed carregada (contagens principais)
select 'accounts' as table_name, count(*) from app.accounts
union all select 'companies', count(*) from app.companies
union all select 'distribution_centers', count(*) from app.distribution_centers
union all select 'carriers', count(*) from app.carriers
union all select 'carrier_services', count(*) from app.carrier_services
union all select 'products', count(*) from app.products
union all select 'product_logistics', count(*) from app.product_logistics
union all select 'freight_tables', count(*) from app.freight_tables
union all select 'freight_table_versions', count(*) from app.freight_table_versions
union all select 'freight_routes', count(*) from app.freight_routes
union all select 'shipping_rules', count(*) from app.shipping_rules
union all select 'api_credentials', count(*) from app.api_credentials
order by table_name;

-- 10) Freight table publicada
select id, table_id, account_id, version_label, status, valid_from, published_at
from app.freight_table_versions
where status = 'PUBLISHED'
order by created_at desc;

-- 11) API credentials existentes
select id, account_id, label, role, is_active, last_used_at, created_at
from app.api_credentials
order by created_at desc;
