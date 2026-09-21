# CHECKLIST_GO_NO_GO.md

## 1) Itens obrigatórios para HOMOLOGAÇÃO (GO/NOGO)

## 1.1 Banco e segurança
- [ ] Migrations aplicadas em ordem (001→004).
- [ ] Seed aplicada sem erro.
- [ ] RLS habilitado/forçado nas tabelas críticas.
- [ ] Policies e funções runtime (`rls_account_id`, autenticação API key) válidas.
- [ ] Índices de idempotência existentes.

## 1.2 API e RBAC
- [ ] `GET /health` retorna `ok=true`.
- [ ] API key válida autentica.
- [ ] API key inválida retorna 401.
- [ ] RBAC: visualizador não altera dados (403 esperado).
- [ ] RBAC: admin acessa operações administrativas.

## 1.3 Fluxo operacional mínimo
- [ ] Importação de pedidos executada.
- [ ] Cotação manual executada com resultado persistido.
- [ ] Cotação automática executada com resultado persistido.
- [ ] Seleção de cotação atualiza estado esperado.
- [ ] Criação de embarque funcional e idempotente.
- [ ] Tracking webhook/polling persiste eventos sem duplicidade indevida.
- [ ] Dashboard responde com métricas reais.
- [ ] Logs consultáveis via endpoints de logs.

## 1.4 Workers
- [ ] Sync Tiny processa jobs pendentes.
- [ ] Retry/backoff funcionando.
- [ ] Dead-letter marcado após limite de tentativas.
- [ ] Sem duplicação de job em concorrência (SKIP LOCKED).

---

## 2) Itens obrigatórios para PRODUÇÃO (GO/NOGO)

## 2.1 Operação e observabilidade
- [ ] Monitoramento de API e workers ativo.
- [ ] Alertas para erro de integração e crescimento de dead-letter.
- [ ] Logs centralizados com retenção definida.

## 2.2 Segurança
- [ ] Segregação de segredos por ambiente.
- [ ] Rotação de tokens/chaves definida.
- [ ] Acesso administrativo restrito e auditável.

## 2.3 Confiabilidade
- [ ] Backup/restauração testados.
- [ ] Plano de rollback testado em ambiente de ensaio.
- [ ] Carga mínima validada (latência e throughput aceitáveis).

## 2.4 Qualidade
- [ ] Suite de testes executada e verde.
- [ ] Testes fim a fim críticos documentados e aprovados.
- [ ] Validação com usuários-chave da operação concluída.

---

## 3) Critérios de ROLLBACK

Executar rollback se ocorrer qualquer condição:
- Falha de isolamento entre tenants.
- Erros críticos de autenticação/autorização em rotas protegidas.
- Perda/corrupção de dados em fluxo de pedido→cotação→embarque.
- Acúmulo de jobs em erro/dead-letter acima do limiar acordado.
- Degradação severa de desempenho ou indisponibilidade.

### Plano mínimo de rollback
1. Congelar novos deploys.
2. Parar workers de escrita.
3. Reverter para release anterior estável.
4. Restaurar backup (se necessário).
5. Revalidar saúde e isolamento antes de reabertura.

---

## 4) Evidências esperadas por etapa

## 4.1 Banco
- Evidência: output/print da execução das migrations e verify SQL.
- Evidência: consulta confirmando policies/RLS/índices.

## 4.2 API
- Evidência: chamadas `curl` com request/response (health, auth, CRUD, logs).
- Evidência: validação RBAC (403 esperado para role sem permissão).

## 4.3 Fluxo operacional
- Evidência: IDs gerados e encadeados (order, quote_request, quote_result, shipment, tracking_event).
- Evidência: dashboard refletindo eventos processados.

## 4.4 Workers
- Evidência: jobs processados com resumo (`picked/success/error/dead_letter`).
- Evidência: casos de retry e dead-letter demonstrados.

## 4.5 Frontend
- Evidência: telas dos fluxos principais (cadastros, cotação, frete, tracking, auditoria).

---

## 5) Decisão GO/NO-GO

### Homologação
- **GO** somente se todos os itens da seção 1 estiverem marcados.
- **NO-GO** se houver qualquer bloqueador de segurança, dados ou fluxo operacional.

### Produção
- **GO** somente se todos os itens da seção 2 estiverem marcados e homologação estiver estável.
- **NO-GO** na ausência de observabilidade, rollback testado e validação operacional.
