# Deploy — Supabase + Render

## Serviços
1. `tms-api` (Node Web Service)
2. `tms-workers` (Node Background Worker)
3. `tms-web` (Static Site)

## Variáveis obrigatórias
- `DATABASE_URL`
- `TINY_BASE_URL`
- `TINY_API_TOKEN`
- `PORT` (apenas API)

## Ordem de bootstrap
1. Aplicar `supabase/migrations/001_init.sql`.
2. Aplicar `supabase/migrations/002_operational_gap_closure.sql`.
3. Aplicar seed opcional `supabase/seeds/001_seed.sql`.
4. Deploy API/Workers com mesmas env vars de banco e Tiny.
5. Deploy frontend apontando para URL da API.
