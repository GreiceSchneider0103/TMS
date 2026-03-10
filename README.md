# TMS Lessul — Operação Logística Omnichannel

Projeto inicial da V1 do TMS próprio com foco em:
- Integração Tiny
- Importação/versionamento de tabelas de frete
- Motor de cotação e regras
- Embarques + tracking
- Dashboard operacional

## Estrutura
- `supabase/migrations`: schema SQL, RLS, funções e índices.
- `supabase/seeds`: dados iniciais para desenvolvimento.
- `apps/api`: API HTTP modular para cadastros, pedidos, cotação, tracking e integrações.
- `apps/web`: frontend admin responsivo com páginas mínimas da V1.
- `workers`: jobs assíncronos para importação, tracking polling e sync Tiny.
- `docs`: arquitetura, fluxos e guia de deploy (Render + Supabase).

## Como usar (MVP de referência)
1. Aplicar SQL em `supabase/migrations/001_init.sql` no projeto Supabase.
2. Popular dados base com `supabase/seeds/001_seed.sql`.
3. Publicar API e workers no Render como serviços separados.
4. Publicar frontend no Render Static Site.

> Este repositório entrega uma base técnica sólida para evolução incremental da V1.
