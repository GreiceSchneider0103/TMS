# TMS Lessul: situação do projeto (24/09/2026)

Chaves e senhas (chave de criptografia, chave de API de administrador, tokens da Shopee) não ficam neste arquivo: estão nas variáveis de ambiente do Render.

## Infraestrutura
- **Repositório:** GreiceSchneider0103/TMS, branch principal `main`. O repositório lessul-project/TMS está parado por enquanto.
- **Pastas do projeto:**
  - `apps/api`: API em Node puro, com roteador próprio. As rotas específicas precisam ser registradas antes das rotas com `/:id`.
  - `apps/web`: site em Next.js 14 com TypeScript.
  - `supabase/migrations`: migrações do banco, da 001 à 012, todas já aplicadas.
- **Banco:** Supabase, projeto `fbkgewitqskhtuyvodqp`, schema `app`. Cada conta só vê os próprios dados, pela regra `app.current_account_id()`. A conta de teste é `11111111-1111-1111-1111-111111111111`.
- **Hospedagem:** Render, no plano gratuito, então o servidor dorme quando fica parado.
  - API: `srv-daoo16rbc2fs73870u00` (tms-api-pchl.onrender.com).
  - Site: `srv-daoo16rbc2fs73870tvg`.
  - O deploy é automático a cada merge no main.
  - Uma rotina do GitHub (`.github/workflows/wake-api.yml`) acorda a API às 08h05 e às 14h05 (horário de Brasília).
- **Variáveis já cadastradas no Render:** `CERTIFICATE_ENCRYPTION_KEY`, que criptografa o certificado digital, a senha dele e os tokens do Tiny.
- **Testes:** em `apps/api`, rodar `npm run check && node tests/run.js`. Em `apps/web`, rodar `npx tsc --noEmit` e `npm run build`.

## Já implementado e em produção (PRs #31 a #38, com merge)
1. **Layout e textos:** telas responsivas (tabelas viram cartões no celular), textos em português com acentos, sem informação técnica na tela, e correções de funções quebradas.
2. **Tabelas de frete:**
   - Download da planilha original que foi enviada.
   - Exportação da tabela em CEP × faixa de peso (valor e prazo), já com as regras do canal, para subir em outras plataformas.
3. **Regras de frete:** escolha de vários estados, regiões, canais e transportadoras (todos, nenhum ou só alguns).
4. **Produtos:**
   - Cadastro por empresa.
   - Aceita qualquer unidade de peso e medida e converte para kg e cm.
   - Importação por planilha.
5. **Menu Logs:** ações no sistema, histórico de integrações e pendências de integração. Uma pendência é um pedido parado por CEP inválido, transportadora sem de-para, falta de cotação ou erro de integração. Cada pendência tem os botões reprocessar e descartar.
6. **Auditoria de frete:** compara o frete cobrado do cliente, o contratado (cotação) e o pago (CT-e).
   - Certificado A1 por empresa, guardado criptografado.
   - Importação de XML de CT-e.
   - Busca na SEFAZ duas vezes por dia (08h e 14h), só para NFs em aberto.
7. **NF de venda:** chega pelo marketplace, pelo ERP ou por envio manual. Também trata a triangulação, quando a NF de remessa tem número diferente da NF do pedido.
8. **Fase 1:**
   - De-para de transportadoras.
   - Pendências de integração.
   - Datas e prazos do pedido.
   - Despacho e entrega manuais dentro do pedido, para transportadoras sem rastreio por API.
9. **Fase 2:**
   - Torre de controle: indicadores de expedição, prazos e ocorrências, com a lista de pedidos por trás de cada número.
   - Financeiro de frete: mapa por estado e filtros.
10. **Frete cobrado:** é puxado na sincronização com a Shopee, o ERP ou a NF.
11. **Tiny ERP pela API v3 (PR #38):**
    - Conexão pelo login do Tiny.
    - Importação de pedidos e produtos.
    - NF de venda.
    - Atualização da situação do pedido no Tiny.
    - Webhook de notificações e sincronização automática a cada 30 minutos.
    - Tela em Configurações > Tiny ERP. A documentação está em `docs/INTEGRACAO_TINY.md`.

## Funcionando e testado
- Todas as telas, os cadastros, as tabelas e regras de frete, a cotação, os pedidos, os embarques e o rastreio manual.
- A torre de controle, o financeiro, a auditoria com XML importado, as pendências e as exportações.
- Os deploys no Render estão no ar e com sucesso.
- Shopee em sandbox: conexão da loja e sincronização de pedidos.

## Implementado, mas ainda não testado com o sistema real
O ambiente de desenvolvimento não tem acesso à rede desses serviços.
- **Tiny v3:** falta conectar um aplicativo real e rodar "Sincronizar pedidos". Pode ser preciso ajustar os códigos de situação, o envio do rastreio no despacho e o formato do webhook.
- **SEFAZ:** busca automática de CT-e com o certificado A1. Depende de cadastrar o certificado e, talvez, das variáveis `SEFAZ_CA_PEM` e `SEFAZ_CTE_ENVIRONMENT`.
- **Shopee em produção:** envio da NF (`add_invoice_data`) e leitura do frete pago pelo comprador (`get_escrow_detail`).

## Pendente: aguardando aprovação (Go-Live) da Shopee
- Trocar no Render as variáveis `SHOPEE_LIVE_PARTNER_ID` e `SHOPEE_LIVE_KEY`. Os valores atuais são do app errado ("DRE Shopee", 2045527); o certo é o app "TMS".
- Cadastrar `SHOPEE_PARTNER_KEY` e mudar `SHOPEE_IS_SANDBOX=false`.
- Confirmar se o app tem permissão para ler pedidos em produção. Pode ser preciso um segundo app da Shopee, da categoria ERP.

## Falta implementar (combinado para depois do Go-Live)
- Vários CDs (centros de distribuição) por conta.
- Catálogo de integrações: novas transportadoras e marketplaces, como Magalu e Mercado Livre direto.
- Rastreio: avisos ao cliente, reclamações e comprovante de entrega.
- DIFAL e taxas na auditoria, quando as regras forem definidas.
- Modelos exatos de planilha de frete de cada plataforma, se forem enviados.

## Cuidados para quem continuar
- Nunca fazer commit de `apps/api/node_modules`: há arquivos rastreados que o `npm install` altera.
- O merge pela API do GitHub exige o SHA completo do commit, com 40 caracteres.
- Para testar o site localmente, as capturas de tela são feitas com Playwright e dados simulados.
