# Deploy Render + Supabase (Homologação Operacional)

## Arquitetura final no Render

### Serviço 1 — API
- **Type:** Web Service
- **Name:** `tms-api`
- **Root Directory:** `apps/api`
- **Build Command:** `npm ci`
- **Start Command:** `npm run dev`
- **Health Check Path:** `/health`

### Serviço 2 — Worker Tiny Sync
- **Type:** Background Worker
- **Name:** `tms-worker-tiny-sync`
- **Root Directory:** `workers`
- **Build Command:** `npm ci`
- **Start Command:** `npm run start`
- **Health Check:** não se aplica

### Serviço 3 — Worker Tracking Polling
- **Type:** Background Worker
- **Name:** `tms-worker-tracking`
- **Root Directory:** `workers`
- **Build Command:** `npm ci`
- **Start Command:** `npm run start:tracking`
- **Health Check:** não se aplica

### Serviço 4 — Frontend Next.js
- **Type:** Web Service (não Static Site)
- **Name:** `tms-web`
- **Root Directory:** `apps/web`
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start`
- **Health Check Path:** `/login`

> Observação: como o frontend usa middleware + rotas API (`/api/session/*`), deve rodar como **Web Service Node**.

---

## Variáveis de ambiente por serviço

### API (`tms-api`)
Obrigatórias:
- `DATABASE_URL`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`
- `INTERNAL_CONTEXT_TOKEN`
- `CORS_ALLOWED_ORIGINS` (incluir URL do frontend Render)

Recomendadas:
- `PORT=10000`
- `CORS_ALLOWED_HEADERS=content-type,x-api-key,x-correlation-id,x-request-id,x-idempotency-key`
- `REQUEST_BODY_LIMIT_BYTES=1048576`
- `RATE_LIMIT_AUTH_MAX=5`
- `RATE_LIMIT_AUTH_WINDOW_MS=60000`
- `RATE_LIMIT_WEBHOOK_MAX=60`
- `RATE_LIMIT_WEBHOOK_WINDOW_MS=60000`
- `RATE_LIMIT_API_MAX=120`
- `RATE_LIMIT_API_WINDOW_MS=60000`
- `SESSION_COOKIE_NAME=tms_api_session`

### Frontend (`tms-web`)
Obrigatórias:
- `NEXT_PUBLIC_API_BASE_URL` (ex.: `https://tms-api.onrender.com`)

Recomendadas:
- `SESSION_COOKIE_NAME=tms_api_session`
- `SESSION_MAX_AGE_SECONDS=28800`
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_DOMAIN` (opcional; só usar se quiser compartilhar cookie entre subdomínios)

### Worker Tiny (`tms-worker-tiny-sync`)
Obrigatórias:
- `DATABASE_URL`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`

Recomendadas:
- `WORKER_NAME=tiny-sync-worker-render`
- `WORKER_POLL_INTERVAL_MS=5000`
- `WORKER_TINY_SYNC_BATCH_SIZE=50`
- `WORKER_IDLE_BACKOFF_MS=2000`
- `WORKER_FAILURE_BACKOFF_MS=7000`
- `TINY_TIMEOUT_MS=15000`

### Worker Tracking (`tms-worker-tracking`)
Obrigatórias:
- `DATABASE_URL`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`

Recomendadas:
- `WORKER_NAME=tracking-polling-worker-render`
- `WORKER_POLL_INTERVAL_MS=10000`
- `WORKER_TRACKING_BATCH_SIZE=100`
- `WORKER_IDLE_BACKOFF_MS=2000`
- `WORKER_FAILURE_BACKOFF_MS=7000`
- `TINY_TIMEOUT_MS=15000`
- `TINY_TRACKING_EVENTS_PATH=/shipments/{trackingCode}/events`

---

## Checklist exato para subir os 4 serviços

1. **Aplicar migrations no Supabase** em ordem (`001` até `006`) e seed se necessário.
2. **Criar/validar API key** em `app.api_credentials`.
3. **Subir pelo `render.yaml`** (Blueprint) ou criar serviços manualmente com os comandos acima.
4. Configurar envs:
   - API primeiro,
   - depois frontend com `NEXT_PUBLIC_API_BASE_URL` da API,
   - depois workers com `DATABASE_URL` + Tiny.
5. Confirmar health:
   - API: `GET /health` = `{"ok":true}`
   - Frontend: `GET /login` = 200
6. Rodar smoke funcional mínimo:
   - login,
   - dashboard,
   - orders list/detail,
   - quotes,
   - shipments,
   - tracking,
   - freight import/publish/rollback,
   - logs.
7. Confirmar CORS:
   - `CORS_ALLOWED_ORIGINS` inclui URL real do frontend Render.

---

## Matriz de readiness (homolog)

| Item | Status | Observação |
|---|---|---|
| API | Pronto | Com `/health`, envs e rate limit configuráveis. |
| Frontend | Pronto | Next.js server-side; exige Web Service e `NEXT_PUBLIC_API_BASE_URL`. |
| Worker Tiny | Pronto | Processo contínuo via `npm run start`. |
| Worker Tracking | Pronto | Processo contínuo via `npm run start:tracking`. |
| Banco (Supabase) | Precisa ajuste | Aplicar migrations `001..006` no ambiente alvo. |
| Sessão/Cookie | Precisa ajuste | Validar `SESSION_COOKIE_SECURE=true` + domínio conforme URL final. |
| CORS | Precisa ajuste | Definir `CORS_ALLOWED_ORIGINS` com URL exata do frontend Render. |
| Logs/Monitoramento | Risco moderado | Recomendado configurar alertas no Render + dashboard de erros. |

---

## Bloqueadores objetivos de deploy
- `NEXT_PUBLIC_API_BASE_URL` ausente/errada no frontend.
- `CORS_ALLOWED_ORIGINS` sem URL do frontend.
- `DATABASE_URL` inválida nos workers/API.
- Migrations não aplicadas no Supabase.
