# Arquitetura Funcional — TMS Lessul V1

## Camadas
- **Supabase**: Postgres + Auth + Storage + RLS + RPCs.
- **API (Render Web Service)**: endpoints operacionais de cadastros, pedidos, cotação, tracking e auditoria.
- **Workers (Render Background Worker)**: importação de tabelas, tracking polling e sincronização Tiny.
- **Frontend (Render Static Site)**: painel administrativo para operação.

## Módulos da API
1. Auth e perfis por tenant
2. Cadastros (empresa, CD, transportadora, serviços, SKU logístico)
3. Pedidos (import Tiny + validação)
4. Motor de cotação e regras
5. Embarques e tracking
6. Integração Tiny (sync status)
7. Dashboard e auditoria

## Estratégia de escalabilidade
- Jobs assíncronos para operações pesadas.
- Idempotência por chaves de negócio (`account_id + external_id`).
- Versionamento de tabela com publicação explícita.
- Camada de adaptadores para novas transportadoras/canais.
