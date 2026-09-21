# RUNBOOK_HOMOLOG_FINAL.md

## Ordem definitiva de execução (Supabase SQL Editor)
> No SQL Editor web do Supabase **não use `\i`**.

1. Execute `00_supabase_bootstrap_final.sql`
2. Execute `01_supabase_seed_homolog_final.sql`
3. Execute `02_supabase_api_key_bootstrap_final.sql` (troque a chave bruta)
4. Execute `03_supabase_verify_final.sql`

## Passo a passo

### 1) Criar projeto no Supabase
1. Acesse Supabase e crie um novo projeto.
2. Aguarde o banco ficar pronto.

### 2) Aplicar banco estrutural final
1. Abra SQL Editor > New query.
2. Cole o conteúdo de `00_supabase_bootstrap_final.sql`.
3. Execute.

### 3) Aplicar seed de homologação
1. Nova query.
2. Cole `01_supabase_seed_homolog_final.sql`.
3. Execute.

### 4) Criar API key de homologação
1. Edite `02_supabase_api_key_bootstrap_final.sql` e troque `LESSUL-HOMOLOG-KEY-CHANGE-ME`.
2. Execute no SQL Editor.
3. Guarde a chave bruta para usar no header `x-api-key`.

### 5) Verificar instalação
1. Execute `03_supabase_verify_final.sql`.
2. Confirme:
   - tabelas/funções/policies criadas
   - RLS e FORCE RLS ativos
   - grants carregados
   - seed presente
   - versão de tabela de frete publicada
   - api_credentials criada

### 6) Configurar envs da API/workers
Use os valores de `.env.example`:
- `DATABASE_URL`
- `PORT`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`
- `INTERNAL_CONTEXT_TOKEN`

### 7) Subir API
```bash
cd apps/api
npm run dev
```

### 8) Sequência mínima de testes
1. Health
2. Auth por API key
3. Isolamento multi-tenant
4. Importação de pedidos
5. Cotação manual
6. Cotação automática
7. Seleção de quote
8. Embarque
9. Tracking webhook + timeline
10. Dashboard

Use `SMOKE_TESTS_TMS_FINAL.md`.

### 9) Teste crítico de isolamento multi-tenant
1. Use `API_KEY_A` para importar pedido exclusivo da conta A.
2. Use `API_KEY_B` para listar pedidos.
3. O pedido da conta A **não pode** aparecer para conta B.

## Observação de risco operacional
- Não use role com `BYPASSRLS` no `DATABASE_URL` da API.
- Se usar role com bypass, RLS não protege isolamento de tenant.
