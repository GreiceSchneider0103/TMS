# TMS Lessul — V1 Operacional (Homologação Técnica)

## Componentes
- `supabase/migrations`: schema e migrações incrementais
- `apps/api`: API Node com persistência Postgres/Supabase
- `workers`: jobs de sync Tiny, tracking e publicação de tabela
- `apps/web`: frontend funcional consumindo API

## Variáveis de ambiente (API e workers)
- `DATABASE_URL`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`
- `PORT` (API)
- `INTERNAL_CONTEXT_TOKEN` (apenas fallback interno controlado)

## Segurança de contexto multi-tenant
A API resolve o contexto por `x-api-key` (ou `Authorization: Bearer <token>`), validando hash em `app.api_credentials`.
`x-account-id` sozinho não é aceito para chamadas externas.

## Runbook de homologação
1. Aplicar migrations em ordem:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_operational_gap_closure.sql`
   - `supabase/migrations/003_hardening_security_idempotency.sql`
2. Aplicar seed opcional: `supabase/seeds/001_seed.sql`.
3. Criar credencial de API:
   - gerar token bruto (ex.: UUID)
   - gravar SHA256 em `app.api_credentials.token_hash` com `account_id` e `is_active=true`
4. Iniciar API: `cd apps/api && npm run dev`
5. Iniciar workers conforme necessidade.
6. Smoke test manual:
   - `GET /health`
   - `POST /orders/import/tiny`
   - `POST /quotes/manual`
   - `POST /shipments`
   - `POST /tracking/webhook/:provider`
   - `GET /dashboard/summary`

## Fluxos implementados
- Importação persistida de pedidos (Tiny adapter + upsert idempotente)
- Cotação manual e automática persistidas (`quote_requests`, `quote_results`)
- Criação de embarques e volumes (`shipments`, `shipment_packages`)
- Tracking via webhook com deduplicação por evento externo
- Parser XLSX real de tabela de frete com draft, publish e rollback
- Dashboard com agregações reais do banco
- Logs em `sync_jobs`, `webhook_logs`, `audit_logs`
