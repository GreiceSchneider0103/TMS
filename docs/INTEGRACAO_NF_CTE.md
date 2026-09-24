# Integração: notas fiscais, CT-e e Shopee

Todas as rotas usam o cabeçalho `x-api-key`. Para ERP/marketplace, gere uma chave com perfil **Integração** em Configurações.

## Enviar NF-e de um pedido (ERP, marketplace ou manual)

`POST /invoices`

```json
{
  "orderExternalId": "TINY-2001",          // ou "orderId" (uuid do TMS) ou "orderNumber"
  "kind": "venda",                         // venda | remessa | outra (opcional)
  "xmlBase64": "<XML da NF-e em base64>"   // recomendado
}
```

Sem XML, dá para mandar só a chave: `{ "orderNumber": "2001", "chave": "4126...", "valorTotal": 1500 }`.

Como o pedido é encontrado quando não é informado:
1. **Triangulação**: se a NF (de remessa) referencia em `NFref` uma NF de venda já ligada a um pedido, ela entra no mesmo pedido como `remessa`.
2. Número do pedido escrito na NF (`xPed`).
3. Caso contrário fica "sem pedido" e pode ser ligada na tela Auditoria de frete → Notas fiscais.

Quando a NF de venda chega depois da de remessa, a remessa é adotada automaticamente pelo pedido.

Outras rotas: `POST /invoices/import` (vários XMLs), `GET /invoices`, `GET /orders/:id/invoices`, `PATCH /invoices/:id` (`orderId`, `kind`), `DELETE /invoices/:id`.

## CT-e

- `POST /ctes/import` — XMLs de CT-e.
- `POST /ctes/sefaz-sync` — busca na SEFAZ para uma empresa (`companyId`), com o certificado A1 dela.
- `GET /ctes/sefaz-schedule` — situação da busca automática.
- Vínculo automático CT-e → embarque, nesta ordem: chave de qualquer NF do pedido (venda ou remessa) citada no CT-e; número do CT-e informado no embarque; número da NF informado no embarque.

### Busca automática na SEFAZ
- Roda às **08h e 14h (Brasília)** — configurável em `SEFAZ_SYNC_HOURS` (ex.: `8,14`).
- Só consulta empresas com certificado válido **e** que tenham embarques dos últimos 120 dias com NF e sem CT-e.
- Respeita a espera de 1 hora exigida pela SEFAZ quando não há documentos novos.
- Como a API está no plano gratuito do Render (dorme sem uso), o workflow `.github/workflows/wake-api.yml` acorda a API nesses horários; ao acordar, a API executa a janela pendente.
- Variáveis: `CERTIFICATE_ENCRYPTION_KEY` (obrigatória), `SEFAZ_CTE_ENVIRONMENT` (`producao`/`homologacao`), `SEFAZ_CA_PEM` (cadeia ICP-Brasil, se necessário), `SEFAZ_SCHEDULER_ENABLED=false` para desligar.

## Shopee (prontas para depois do Go-Live)

- `POST /integrations/shopee/orders/:orderId/invoice` — envia os dados da NF de venda à Shopee (`v2.order.add_invoice_data`).
- `POST /integrations/shopee/orders/:orderId/dispatch` — despacha; se houver NF de venda ainda não enviada, envia antes (falha no envio da NF não bloqueia o despacho e volta em `invoiceWarning`).
- `POST /integrations/shopee/sync`, `GET /integrations/shopee/shops`, `GET /integrations/shopee/auth-url`.
