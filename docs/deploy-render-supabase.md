# Deploy — Supabase + Render

## Serviços
1. `tms-api` (Node Web Service)
2. `tms-workers` (Node Background Worker — Tiny status sync)
3. `tms-workers-tracking` (Node Background Worker — tracking polling contínuo)
4. `tms-web` (Static Site)

## Variáveis obrigatórias
- `DATABASE_URL`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`
- `PORT` (API)
- `INTERNAL_CONTEXT_TOKEN` (somente para integração interna controlada)
- `CORS_ALLOWED_ORIGINS` (opcional, CSV; ex.: `https://my-ui.app.github.dev,https://*.app.github.dev`)
- `CORS_ALLOWED_HEADERS` (opcional, CSV; default: `content-type,x-api-key,x-correlation-id`)

## Variáveis recomendadas para worker contínuo
- `WORKER_NAME` (ex.: `tiny-sync-worker-prod-1` / `tracking-polling-worker-prod-1`)
- `WORKER_POLL_INTERVAL_MS` (default `5000` para sync e `10000` para tracking)
- `WORKER_TINY_SYNC_BATCH_SIZE` (default `50`)
- `WORKER_TRACKING_BATCH_SIZE` (default `100`)
- `WORKER_IDLE_BACKOFF_MS` (default `2000`)
- `WORKER_FAILURE_BACKOFF_MS` (default `7000`)
- `TINY_TIMEOUT_MS` (default `15000`)
- `TINY_TRACKING_EVENTS_PATH` (default `/shipments/{trackingCode}/events`)

## Variáveis recomendadas para worker contínuo
- `WORKER_NAME` (ex.: `tiny-sync-worker-prod-1` / `tracking-polling-worker-prod-1`)
- `WORKER_POLL_INTERVAL_MS` (default `5000` para sync e `10000` para tracking)
- `WORKER_TINY_SYNC_BATCH_SIZE` (default `50`)
- `WORKER_TRACKING_BATCH_SIZE` (default `100`)
- `WORKER_IDLE_BACKOFF_MS` (default `2000`)
- `WORKER_FAILURE_BACKOFF_MS` (default `7000`)
- `TINY_TIMEOUT_MS` (default `15000`)
- `TINY_TRACKING_EVENTS_PATH` (default `/shipments/{trackingCode}/events`)

## Ordem de bootstrap
1. Aplicar `supabase/migrations/001_init.sql`.
2. Aplicar `supabase/migrations/002_operational_gap_closure.sql`.
3. Aplicar `supabase/migrations/003_hardening_security_idempotency.sql`.
4. Aplicar `supabase/migrations/004_v1_operational_crud.sql`.
5. Aplicar `supabase/migrations/005_homologation_fixes.sql`.
6. Aplicar seed opcional `supabase/seeds/001_seed.sql`.
7. Criar `app.api_credentials` com hash SHA256 do token de integração.
8. Deploy API e workers com mesmas env vars de banco e Tiny.

## Estratégia mínima confiável para workers reais
- Worker Tiny status sync contínuo: `npm run start`.
- Worker tracking polling contínuo: `npm run start:tracking`.
- Execução pontual/controlada (sync): `npm run start:once`.
- Múltiplas réplicas podem rodar em paralelo com segurança por `for update skip locked` no picking de jobs de sync.
- Encerramento gracioso em ambos workers: captura `SIGTERM`/`SIGINT`, conclui ciclo corrente e para sem aceitar novos ciclos.

## Monitoramento mínimo recomendado
- Alertar se não houver log `tiny_sync_batch_done` por janela esperada (ex.: 2 min).
- Alertar crescimento de `tiny_sync_dead_letter`.
- Alertar `worker_cycle_error` consecutivos acima de limiar (ex.: 5).
- Alertar crescimento de `tracking_polling_shipment_error`.
- Alertar ausência de `tracking_polling_cycle_done` em janela esperada.

## Smoke test de homolog
- API: `GET /health`
- Pedidos: `POST /orders/import/tiny`
- Cotação: `POST /quotes/manual`
- Embarque: `POST /shipments`
- Tracking webhook: `POST /tracking/webhook/:provider`
- Logs operacionais: `GET /logs/sync-jobs`
