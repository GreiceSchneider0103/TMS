# RUNBOOK_SUPABASE.md

## 1) Criar projeto no Supabase
1. Acesse https://supabase.com
2. Crie um novo projeto.
3. Aguarde o banco ficar disponível.

## 2) Abrir SQL Editor
1. No painel do projeto, vá em **SQL Editor**.
2. Clique em **New query**.

## 3) Rodar bootstrap do banco
1. Abra o arquivo `00_supabase_bootstrap.sql`.
2. Copie todo o conteúdo.
3. Cole no SQL Editor.
4. Execute.

Resultado esperado:
- schema `app` criado
- tabelas do domínio TMS criadas
- índices, RLS, policies, funções RPC criadas

## 4) Rodar seed mínima de homologação
1. Abra `01_supabase_seed_homolog.sql`.
2. Cole e execute no SQL Editor.

Resultado esperado:
- conta homolog
- company / distribution_center
- carriers / carrier_services
- product + product_logistics
- freight table + versão publicada + rotas
- shipping rules básicas

## 5) Cadastrar API key de homologação
1. Abra `02_supabase_api_key_bootstrap.sql`.
2. Troque a chave bruta de exemplo:
   - `LESSUL-HOMOLOG-KEY-CHANGE-ME`
3. Execute.
4. Guarde a chave bruta para usar como `x-api-key` na API.

## 6) Verificar se tudo subiu corretamente
1. Abra `03_supabase_verify.sql`.
2. Execute.
3. Confira:
   - tabelas
   - índices críticos
   - RLS e FORCE RLS
   - policies
   - funções
   - seed e versão published
   - api_credentials

## 7) Obter DATABASE_URL correta
1. No Supabase: **Project Settings > Database**.
2. Copie a string de conexão Postgres (Connection string).
3. Ajuste para o formato usado em `.env.example`.

## 8) Configurar API/Workers local ou Render
Defina as variáveis:
- `DATABASE_URL`
- `PORT`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`
- `INTERNAL_CONTEXT_TOKEN`

## 9) Próximo passo (Render/local)
1. Subir API (`apps/api`) com as envs.
2. Subir workers (`workers`) com as mesmas envs de banco/Tiny.
3. Executar smoke tests HTTP com `x-api-key` usando a chave cadastrada no passo 5.

