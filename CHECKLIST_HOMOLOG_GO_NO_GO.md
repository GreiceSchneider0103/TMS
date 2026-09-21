# CHECKLIST_HOMOLOG_GO_NO_GO.md

## Status possíveis
- **BLOQUEADO**
- **APTO PARA HOMOLOGAÇÃO**
- **APTO PARA TESTE INTEGRADO COM TINY**

## 1) Estrutura de banco
- [ ] `00_supabase_bootstrap_final.sql` executado sem erro
- [ ] `03_supabase_verify_final.sql` confirma tabelas/funções/policies/RLS/grants
- [ ] Existe pelo menos 1 versão `PUBLISHED` em `app.freight_table_versions`

Se qualquer item falhar: **BLOQUEADO**

## 2) Segurança multi-tenant
- [ ] API key válida autentica
- [ ] API key inválida falha
- [ ] Teste cruzado A/B não vaza dados entre contas

Se falhar isolamento: **BLOQUEADO**

## 3) Fluxos principais
- [ ] Importação de pedidos funciona
- [ ] Cotação manual funciona
- [ ] Cotação automática funciona
- [ ] Seleção de quote funciona
- [ ] Embarque funciona
- [ ] Tracking webhook + timeline funciona
- [ ] Dashboard retorna dados

Se todos acima passarem: **APTO PARA HOMOLOGAÇÃO**

## 4) Integração Tiny
- [ ] `TINY_BASE_URL` e `TINY_API_TOKEN` configurados
- [ ] Import Tiny sem erro de autenticação externa
- [ ] Sync Tiny processa jobs sem erro recorrente

Se seção 3 ok + seção 4 ok: **APTO PARA TESTE INTEGRADO COM TINY**
