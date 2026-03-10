# Arquitetura Funcional — TMS Lessul V1 (Operacional)

## Banco (Supabase/Postgres)
- Migração base + incremental com entidades operacionais.
- RLS por `account_id` em tabelas de negócio.
- Índices e chaves de idempotência para quotes, tracking e webhooks.

## API
- Persistência real com `pg` em `DATABASE_URL`.
- Fluxos: pedidos, cotação, embarques, tracking webhook, dashboard e importação de tabela.
- Tiny adapter HTTP com autenticação por token.

## Workers
- Sync Tiny com retentativa em `sync_jobs`.
- Tracking polling persistente e idempotente.
- Publicação de versão de tabela por worker.

## Frontend
- Painéis funcionais consumindo API real (dashboard/pedidos/cotação/embarques).
