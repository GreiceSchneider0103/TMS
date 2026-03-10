# Deploy — Supabase + Render

## Serviços no Render
1. `tms-api` (Web Service)
2. `tms-workers` (Background Worker)
3. `tms-web` (Static Site)

## Variáveis recomendadas
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TINY_API_TOKEN`
- `APP_ENV`

## Passos
1. Criar projeto Supabase e executar `supabase/migrations/001_init.sql`.
2. Executar seed `supabase/seeds/001_seed.sql`.
3. Publicar API e workers no Render apontando para os diretórios `apps/api` e `workers`.
4. Publicar `apps/web` como site estático.
5. Configurar cron para tracking polling e retentativas de sincronização.
