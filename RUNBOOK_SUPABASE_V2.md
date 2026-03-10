# RUNBOOK_SUPABASE_V2.md

## Diferença importante: Supabase SQL Editor vs psql
- No **SQL Editor web do Supabase** NÃO use `\i`.
- Execute cada arquivo abrindo o conteúdo e colando manualmente na query.
- `\i` só funciona no cliente `psql` local.

## Ordem correta de execução (homolog)
1. `00_supabase_bootstrap.sql`
2. `01_supabase_seed_homolog.sql`
3. `02_supabase_api_key_bootstrap.sql` (troque a chave bruta)
4. `03_supabase_verify.sql`
5. `04_supabase_runtime_rls_patch.sql`
6. `05_supabase_roles_grants_patch.sql`
7. `06_supabase_verify_runtime_rls.sql`

## Passo a passo no Supabase SQL Editor
1. Crie o projeto no Supabase.
2. Abra SQL Editor -> New query.
3. Cole e execute `00_supabase_bootstrap.sql`.
4. Cole e execute `01_supabase_seed_homolog.sql`.
5. Cole e execute `02_supabase_api_key_bootstrap.sql` após trocar a chave bruta.
6. Cole e execute `03_supabase_verify.sql`.
7. Aplique patch runtime/RLS: `04_supabase_runtime_rls_patch.sql`.
8. Aplique grants: `05_supabase_roles_grants_patch.sql`.
9. Execute verificação final: `06_supabase_verify_runtime_rls.sql`.

## Validação do contexto de conta em runtime (API)
Objetivo: provar que a API propaga `account_id` para a sessão SQL.

1. Garanta que a API está com `DATABASE_URL` + token de API.
2. Faça request com `x-api-key` válido.
3. Verifique se a resposta vem com `correlationId` e dados apenas da conta da chave.
4. Teste com chave de outra conta e compare resultados.

## Validação de RLS em runtime
1. Rode `06_supabase_verify_runtime_rls.sql` e confirme:
   - funções `rls_account_id` e `authenticate_api_key` existem
   - policies críticas usam `app.rls_account_id()`
   - `force_rls = true` nas tabelas críticas
2. Teste endpoint de leitura (`/orders`) com duas chaves de contas diferentes:
   - cada chave deve ver apenas seus próprios dados.

## Como subir API depois do patch
1. Configure `.env` com:
   - `DATABASE_URL`
   - `PORT`
   - `TINY_BASE_URL`
   - `TINY_API_TOKEN`
   - `INTERNAL_CONTEXT_TOKEN`
2. Suba API: `cd apps/api && npm run dev`
3. Execute smoke tests HTTP (arquivo `SMOKE_TESTS_TMS.md`).

## Observação de segurança crítica
- Evite rodar API com role de banco que tenha `BYPASSRLS`.
- Se a role usada no `DATABASE_URL` tiver bypass, RLS perde efetividade.
