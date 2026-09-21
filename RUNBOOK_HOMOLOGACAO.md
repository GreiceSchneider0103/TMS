# RUNBOOK_HOMOLOGACAO.md

## 1) Pré-requisitos

### Infra e ferramentas
- PostgreSQL/Supabase acessível com credenciais de administrador do schema `app`.
- Node.js 20+ (recomendado 22.x) e npm.
- Git para versionamento e rastreabilidade.
- Acesso de rede ao endpoint do banco (`DATABASE_URL`) e, se aplicável, ao Tiny (`TINY_BASE_URL`).

### Permissões
- Permissão para executar SQL no banco de homologação.
- Permissão para inserir credenciais de API em `app.api_credentials`.
- Permissão para subir processos da API, workers e frontend local.

### Artefatos necessários
- Código atualizado do repositório.
- Migrations em `supabase/migrations`.
- Seed em `supabase/seeds/001_seed.sql`.
- Scripts de verificação (`03_supabase_verify*.sql`, `06_supabase_verify_runtime_rls.sql`).

---

## 2) Instalação

### 2.1 Clonar e acessar repositório
```bash
git clone <repo-url>
cd TMS
```

### 2.2 Instalar dependências da API
```bash
cd apps/api
npm install
cd ../..
```

### 2.3 Instalar dependências dos workers
```bash
cd workers
npm install
cd ..
```

### 2.4 (Opcional) Servir frontend estático
Frontend não tem build; pode ser servido por servidor estático simples.

---

## 3) Variáveis de ambiente

Crie um `.env` para API e workers com os valores mínimos:

```env
DATABASE_URL=postgresql://<user>:<pass>@<host>:<port>/<db>?sslmode=require
TINY_BASE_URL=https://api.tiny.com.br/api2
TINY_API_TOKEN=<token_tiny>
PORT=3001
INTERNAL_CONTEXT_TOKEN=<token_interno_apenas_backend>
```

### Observações
- `DATABASE_URL` é obrigatório para API e workers.
- `TINY_BASE_URL` e `TINY_API_TOKEN` são obrigatórios para sync real com Tiny.
- `INTERNAL_CONTEXT_TOKEN` deve ser usado apenas para chamadas internas controladas.

---

## 4) Ordem de execução (obrigatória)

## 4.1 Aplicar migrations (ordem estrita)
1. `supabase/migrations/001_init.sql`
2. `supabase/migrations/002_operational_gap_closure.sql`
3. `supabase/migrations/003_hardening_security_idempotency.sql`
4. `supabase/migrations/004_v1_operational_crud.sql`

## 4.2 Aplicar seed (homologação)
- `supabase/seeds/001_seed.sql`

## 4.3 Aplicar patches/runtime SQL auxiliares (quando necessário ao ambiente)
- `04_supabase_runtime_rls_patch.sql`
- `05_supabase_roles_grants_patch.sql`

## 4.4 Criar/validar credencial de API
- Inserir hash SHA256 em `app.api_credentials.token_hash`.
- Definir `account_id`, `role`, `is_active=true`.

## 4.5 Subir API
- `cd apps/api && npm run dev`

## 4.6 Subir workers
- Tiny sync: executar rotina de batch conforme operação (script/runner interno).
- Tracking polling: executar ciclo de polling conforme agendamento operacional.

## 4.7 Subir frontend
- `cd apps/web && python3 -m http.server 4173`

---

## 5) Como aplicar migrations e seed

### 5.1 Via SQL editor (Supabase)
- Execute cada arquivo SQL na ordem definida.
- Não pule etapas de hardening/patch quando aplicável ao ambiente.

### 5.2 Validação pós-migration
- Execute:
  - `03_supabase_verify.sql` (ou final equivalente)
  - `06_supabase_verify_runtime_rls.sql`

### 5.3 Resultado esperado
- Tabelas, tipos, funções e policies existentes.
- RLS habilitado/forçado nas tabelas críticas.
- Índices de idempotência ativos.

---

## 6) Como subir API, workers e frontend

## 6.1 API
```bash
cd apps/api
npm run check
npm test
npm run dev
```

## 6.2 Workers
```bash
cd workers
npm run check
```

> Observação operacional: execução contínua dos workers deve ser feita por scheduler/process manager (ex.: cron, Render background worker, supervisor).

## 6.3 Frontend
```bash
cd apps/web
python3 -m http.server 4173
```
Acesse: `http://localhost:4173`

---

## 7) Como validar saúde do sistema

## 7.1 Saúde básica da API
```bash
curl -sS http://localhost:3001/health
```
Esperado: `{"ok":true}`

## 7.2 Autenticação/API key
- Testar com `x-api-key` válida e inválida.
- Esperado: válida responde dados; inválida retorna erro 401.

## 7.3 Fluxo mínimo fim a fim (homologação)
1. Importar pedido (`POST /orders/import/tiny`)
2. Cotar manual/automático (`POST /quotes/manual` / `POST /quotes/automatic/:orderId`)
3. Selecionar cotação (`PATCH /quotes/results/:id/select`)
4. Criar embarque (`POST /shipments`)
5. Enviar evento tracking (`POST /tracking/webhook/:provider`)
6. Ver dashboard (`GET /dashboard/summary`)
7. Ver logs (`/logs/audit`, `/logs/sync`, `/logs/webhooks`)

## 7.4 Validação de segurança e isolamento
- Validar RBAC com perfis distintos.
- Validar isolamento tenant com duas API keys de contas diferentes.

## 7.5 Critérios mínimos de saúde
- API responde `health`.
- RLS ativo e isolamento confirmado.
- Fluxo fim a fim executado sem erro bloqueante.
- Workers processam jobs com retry/dead-letter conforme esperado.

---

## 8) Troubleshooting rápido

- `ERR_MODULE_NOT_FOUND: pg`:
  - executar `npm install` em `apps/api` e `workers`.
- Erro de autenticação:
  - validar API key/hash em `app.api_credentials`.
- Dados não aparecem por tenant:
  - conferir `account_id` da credencial e contexto de sessão.
- Jobs travados em `error`:
  - verificar `next_retry_at`, `attempts`, `dead_letter` em `app.sync_jobs`.

---

## 9) Encerramento da rodada de homologação

Registrar evidências:
- Logs de comandos executados.
- Prints/telas do frontend.
- Saída dos endpoints críticos.
- Resultado dos scripts SQL de verificação.
