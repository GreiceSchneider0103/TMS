# SMOKE_TESTS_TMS_FINAL.md

Base URL: `http://localhost:3001`

Headers padrão protegidos:
- `content-type: application/json`
- `x-api-key: <API_KEY>`
- `x-correlation-id: smoke-<nome>-001`

## 1) health
```bash
curl -sS http://localhost:3001/health
```
Esperado: `{"ok":true}`

## 2) auth por API key
### 2.1 válida
```bash
curl -sS http://localhost:3001/orders \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-auth-ok-001"
```
Esperado: JSON de resposta sem erro de auth.

### 2.2 inválida
```bash
curl -sS http://localhost:3001/orders \
  -H "x-api-key: INVALID" \
  -H "x-correlation-id: smoke-auth-fail-001"
```
Esperado: erro `Invalid API key` ou `Unauthorized context`.

## 3) isolamento multi-tenant (crítico)
### 3.1 importar pedido na conta A
```bash
curl -sS -X POST http://localhost:3001/orders/import/tiny \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-tenant-a-import-001" \
  -d '{"orders":[{"id":"A-ONLY-100","number":"A-100","channel":"tiny","total":999.00}],"idempotencyKey":"tenant-a-only-100"}'
```

### 3.2 listar pedidos na conta B
```bash
curl -sS http://localhost:3001/orders \
  -H "x-api-key: <API_KEY_B>" \
  -H "x-correlation-id: smoke-tenant-b-list-001"
```
Esperado: item `A-ONLY-100` não aparece na conta B.

## 4) importação de pedidos
```bash
curl -sS -X POST http://localhost:3001/orders/import/tiny \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-import-001" \
  -d '{"orders":[{"id":"TINY-2001","number":"2001","channel":"tiny","total":1500.00}],"idempotencyKey":"smoke-import-2001"}'
```
Esperado: `importedCount >= 1`.

## 5) cotação manual
```bash
curl -sS -X POST http://localhost:3001/quotes/manual \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-quote-manual-001" \
  -d '{"destinationPostalCode":"90010000","state":"RS","city":"Porto Alegre","invoiceAmount":3200,"weightKg":40,"lengthCm":200,"widthCm":90,"heightCm":70,"channel":"tiny","recipientType":"PF"}'
```
Esperado: `request.id` e `results[]`.

## 6) cotação automática
```bash
curl -sS -X POST http://localhost:3001/quotes/automatic/<ORDER_ID> \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-quote-auto-001" \
  -d '{}'
```
Esperado: `request.id` e `results[]`.

## 7) seleção de quote
```bash
curl -sS -X PATCH http://localhost:3001/quotes/results/<QUOTE_RESULT_ID>/select \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-quote-select-001"
```
Esperado: `{ "selected": true, ... }`

## 8) criação de embarque
```bash
curl -sS -X POST http://localhost:3001/shipments \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-shipment-create-001" \
  -d '{"orderId":"<ORDER_ID>","quoteResultId":"<QUOTE_RESULT_ID>","trackingCode":"TRACK-SMOKE-001","packages":[{"package_number":1,"weight_kg":40}],"idempotencyKey":"smoke-shipment-001"}'
```
Esperado: embarque criado ou `reused=true`.

## 9) tracking webhook
```bash
curl -sS -X POST http://localhost:3001/tracking/webhook/tiny \
  -H "content-type: application/json" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-track-webhook-001" \
  -d '{"eventId":"evt-smoke-001","shipmentId":"<SHIPMENT_ID>","status":"in_transit","occurredAt":"2026-03-11T10:00:00Z"}'
```
Esperado: `{ "processed": true, ... }`.

## 10) timeline
```bash
curl -sS http://localhost:3001/tracking/shipment/<SHIPMENT_ID> \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-track-timeline-001"
```
Esperado: evento aparece em `items`.

## 11) dashboard
```bash
curl -sS "http://localhost:3001/dashboard/summary?from=2026-01-01&to=2026-12-31" \
  -H "x-api-key: <API_KEY_A>" \
  -H "x-correlation-id: smoke-dashboard-001"
```
Esperado: métricas retornadas com `byCarrier`.
