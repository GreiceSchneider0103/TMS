# Integração Tiny ERP (API v3)

## Como conectar
1. No Tiny: **Configurações > Aplicativos** → criar aplicativo (API v3).
2. URL de redirecionamento: `https://tms-api-pchl.onrender.com/webhooks/tiny/oauth-callback` (exibida em Configurações > Tiny ERP).
3. Colar Client ID e Client Secret no TMS, salvar e clicar em **Autorizar no Tiny**.
4. Opcional: em **Configurações > Webhooks** do Tiny, cadastrar a URL de notificações exibida no TMS (pedidos entram na hora).

O Client Secret e os tokens ficam criptografados (AES-256-GCM, `CERTIFICATE_ENCRYPTION_KEY`). O token de acesso é renovado sozinho; se o refresh expirar, a tela pede nova autorização.

## O que a integração faz
| Opção | Efeito |
|---|---|
| Baixar pedidos | `GET /pedidos` nas situações escolhidas (padrão: aprovado, preparando envio, faturado, pronto para envio) e `GET /pedidos/{id}`; passa pelo de-para, validação de CEP e cotação |
| Sincronizar automaticamente | a cada 30 min enquanto a API está acordada (`TINY_SYNC_MINUTES`, `TINY_SCHEDULER_ENABLED=false` desliga) |
| Importar produtos | cadastra SKUs novos com peso/medidas do Tiny (`GET /produtos/{id}`) |
| Atualizar medidas | sobrescreve peso/medidas de produtos já cadastrados |
| Baixar NF de venda | `GET /notas/{id}/xml` → NF de venda ligada ao pedido (auditoria de frete) |
| Atualizar situação no Tiny | despacho → Enviado (5), entrega → Entregue (6), ocorrência/devolução → Não entregue (9) |

- Pedidos Shopee que chegam pelo Tiny usam a mesma chave da integração direta (`shopee-<order_sn>`), então não duplicam.
- Frete cobrado = `valorFrete` do pedido. Transportadora/forma de envio vão para o de-para.
- Peso/medidas do pedido: soma dos produtos cadastrados; sem cadastro usa o peso do pedido no Tiny ou 1 kg.
- Erros viram pendências em **Logs > Pendências** (origem `tiny`).

## Rotas
- `GET/PATCH/DELETE /integrations/tiny` — status, credenciais/opções, desconectar
- `GET /integrations/tiny/auth-url` — link de autorização
- `GET /webhooks/tiny/oauth-callback` — retorno do Tiny
- `POST /integrations/tiny/sync` `{ kind: "orders" | "products", daysBack? }`
- `POST /webhooks/tiny/{token}` — notificações do Tiny
- `POST /orders/import/tiny` sem `orders` no corpo agora usa a API v3.
