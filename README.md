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

## Fluxos implementados
- Importação persistida de pedidos (Tiny adapter + upsert idempotente)
- Cotação manual e automática persistidas (`quote_requests`, `quote_results`)
- Criação de embarques e volumes (`shipments`, `shipment_packages`)
- Tracking via webhook com deduplicação por evento externo
- Parser XLSX real de tabela de frete com draft, publish e rollback
- Dashboard com agregações reais do banco
- Logs em `sync_jobs`, `webhook_logs`, `audit_logs`

## Execução local
1. Aplicar migrations `001_init.sql` e `002_operational_gap_closure.sql`.
2. (Opcional) aplicar seed `supabase/seeds/001_seed.sql`.
3. Iniciar API: `cd apps/api && npm run dev`
4. Abrir frontend estático em `apps/web`.
