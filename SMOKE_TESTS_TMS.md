# SMOKE_TESTS_TMS.md

> Pré-requisitos:
- API no ar em `http://localhost:3001`
- `x-api-key` válido para a conta A
- opcional: `x-api-key` válido para conta B (teste isolamento)

Headers padrão:
- `content-type: application/json`
- `x-api-key: <API_KEY>`
- `x-correlation-id: smoke-<nome>-001`

## 1) Health
```bash
curl -sS http://localhost:3001/health
```
Esperado: `{"ok":true}`

## 2) Autenticação por API key (válida)
```bash
curl -sS http://localhost:3001/orders \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-auth-ok-001"
```
Esperado: resposta JSON sem erro de autenticação.

## 3) Autenticação por API key (inválida)
```bash
curl -sS http://localhost:3001/orders \
  -H "x-api-key: INVALID" \
  -H "x-correlation-id: smoke-auth-fail-001"
```
Esperado: erro `Invalid API key` / `Unauthorized context`.

## 4) Importação de pedidos (persistência)
```bash
curl -sS -X POST http://localhost:3001/orders/import/tiny \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-import-001" \
  -d '{"orders":[{"id":"TINY-2001","number":"2001","channel":"tiny","total":1500.00}],"idempotencyKey":"smoke-import-2001"}'
```
Esperado: `importedCount >= 1`.

## 5) Listagem pedidos
```bash
curl -sS http://localhost:3001/orders \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-orders-list-001"
```
Esperado: pedido importado aparece em `items`.

## 6) Cotação manual
```bash
curl -sS -X POST http://localhost:3001/quotes/manual \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-quote-manual-001" \
  -d '{"destinationPostalCode":"90010000","state":"RS","city":"Porto Alegre","invoiceAmount":3200,"weightKg":40,"lengthCm":200,"widthCm":90,"heightCm":70,"channel":"tiny","recipientType":"PF"}'
```
Esperado: `request.id` e `results[]`.

## 7) Cotação automática
```bash
curl -sS -X POST http://localhost:3001/quotes/automatic/<ORDER_ID> \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-quote-auto-001" \
  -d '{}'
```
Esperado: `request.id` e `results[]`.

## 8) Selecionar resultado de cotação
```bash
curl -sS -X PATCH http://localhost:3001/quotes/results/<QUOTE_RESULT_ID>/select \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-quote-select-001"
```
Esperado: `{ "selected": true, ... }`

## 9) Criar embarque
```bash
curl -sS -X POST http://localhost:3001/shipments \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-shipment-create-001" \
  -d '{"orderId":"<ORDER_ID>","quoteResultId":"<QUOTE_RESULT_ID>","trackingCode":"TRACK-SMOKE-001","packages":[{"package_number":1,"weight_kg":40}],"idempotencyKey":"smoke-shipment-001"}'
```
Esperado: embarque criado ou `reused=true`.

## 10) Consultar embarque
```bash
curl -sS http://localhost:3001/shipments/<SHIPMENT_ID> \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-shipment-get-001"
```
Esperado: shipment com `packages` e `tracking`.

## 11) Webhook tracking
```bash
curl -sS -X POST http://localhost:3001/tracking/webhook/tiny \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-track-webhook-001" \
  -d '{"eventId":"evt-smoke-001","shipmentId":"<SHIPMENT_ID>","status":"in_transit","occurredAt":"2026-03-11T10:00:00Z"}'
```
Esperado: `{ "processed": true, ... }`.

## 12) Timeline tracking
```bash
curl -sS http://localhost:3001/tracking/shipment/<SHIPMENT_ID> \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-track-timeline-001"
```
Esperado: evento do webhook aparece em `items`.

## 13) Dashboard
```bash
curl -sS "http://localhost:3001/dashboard/summary?from=2026-01-01&to=2026-12-31" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-dashboard-001"
```
Esperado: métricas com `byCarrier`.

## 14) Isolamento multi-tenant (teste crítico)
1. Com `API_KEY_A`, importe um pedido exclusivo da conta A.
2. Com `API_KEY_B`, chame `/orders`.
3. Verifique que pedido da conta A não aparece para B.

Comandos:
```bash
# Conta A
curl -sS -X POST http://localhost:3001/orders/import/tiny \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -d '{"orders":[{"id":"A-ONLY-100","number":"A-100","channel":"tiny","total":999.00}],"idempotencyKey":"tenant-a-only-100"}'

# Conta B
curl -sS http://localhost:3001/orders -H "x-api-key: <API_KEY_B>"
```
Esperado: item `A-ONLY-100` NÃO deve aparecer na resposta da conta B.
