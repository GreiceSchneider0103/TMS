-- 05_supabase_roles_grants_patch.sql
-- Patch de grants/roles para Supabase + API runtime
-- IMPORTANTE:
-- 1) Este patch NÃO cria roles customizadas (nem sempre permitido no SQL Editor).
-- 2) O runtime seguro assume conexão com role sem BYPASSRLS.
-- 3) Evite usar superuser/owner no runtime da API.

-- Schema usage
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- Tabelas: remover acesso aberto e conceder mínimo necessário
revoke all on all tables in schema app from public;
grant select, insert, update, delete on all tables in schema app to authenticated, service_role;

-- Sequences
revoke all on all sequences in schema app from public;
grant usage, select on all sequences in schema app to authenticated, service_role;

-- Functions
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- Defaults para objetos futuros
alter default privileges in schema app revoke all on tables from public;
alter default privileges in schema app grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema app revoke all on sequences from public;
alter default privileges in schema app grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema app revoke all on functions from public;
alter default privileges in schema app grant execute on functions to authenticated, service_role;

-- Hardening adicional para api_credentials:
-- consumo de autenticação deve ocorrer pela função SECURITY DEFINER app.authenticate_api_key.
revoke all on table app.api_credentials from anon;
revoke all on table app.api_credentials from authenticated;

-- service_role mantém acesso administrativo completo quando necessário.
grant select, insert, update, delete on table app.api_credentials to service_role;

-- Verificação rápida de grants e owners
select n.nspname as schema_name, c.relname as table_name, pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'app' and c.relkind = 'r'
order by c.relname;

