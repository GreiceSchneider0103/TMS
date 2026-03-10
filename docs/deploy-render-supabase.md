# Deploy — Supabase + Render

## Serviços
1. `tms-api` (Node Web Service)
2. `tms-workers` (Node Background Worker)
3. `tms-web` (Static Site)

## Variáveis obrigatórias
- `DATABASE_URL`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`
- `PORT` (API)
- `INTERNAL_CONTEXT_TOKEN` (somente para integração interna controlada)

## Ordem de bootstrap
1. Aplicar `supabase/migrations/001_init.sql`.
2. Aplicar `supabase/migrations/002_operational_gap_closure.sql`.
3. Aplicar `supabase/migrations/003_hardening_security_idempotency.sql`.
4. Aplicar seed opcional `supabase/seeds/001_seed.sql`.
5. Criar `app.api_credentials` com hash SHA256 do token de integração.
6. Deploy API/Workers com mesmas env vars de banco e Tiny.
7. Deploy frontend apontando para URL da API.

## Smoke test de homolog
- API: `GET /health`
- Pedidos: `POST /orders/import/tiny`
- Cotação: `POST /quotes/manual`
- Embarque: `POST /shipments`
- Tracking: `POST /tracking/webhook/:provider`
- Dashboard: `GET /dashboard/summary`
