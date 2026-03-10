-- 02_supabase_api_key_bootstrap.sql
-- Bootstrap de API key para homologação

create extension if not exists pgcrypto;

-- Exemplo 1 (recomendado): inserir chave bruta direto no SQL (trocar valor)
-- IMPORTANTE: troque o valor 'LESSUL-HOMOLOG-KEY-CHANGE-ME' antes de rodar.
insert into app.api_credentials (
  account_id,
  label,
  token_hash,
  role,
  is_active
)
values (
  '11111111-1111-1111-1111-111111111111',
  'homolog-primary-key',
  encode(digest('LESSUL-HOMOLOG-KEY-CHANGE-ME', 'sha256'), 'hex'),
  'integracao',
  true
)
on conflict (token_hash) do update
set is_active = excluded.is_active,
    label = excluded.label,
    role = excluded.role;

-- Exemplo 2: gerar e verificar hash de uma chave (consulta auxiliar)
select
  'LESSUL-HOMOLOG-KEY-CHANGE-ME' as raw_key_example,
  encode(digest('LESSUL-HOMOLOG-KEY-CHANGE-ME', 'sha256'), 'hex') as sha256_hash_example;

-- Verificar credenciais criadas
select
  id,
  account_id,
  label,
  role,
  is_active,
  last_used_at,
  created_at
from app.api_credentials
where account_id = '11111111-1111-1111-1111-111111111111'
order by created_at desc;
