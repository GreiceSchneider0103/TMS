# Pré-validação e saneamento para índices únicos de homologação

## 1) Queries de diagnóstico de duplicados

### 1.1 `app.webhook_logs(account_id, provider, event_key)`
```sql
select
  account_id,
  provider,
  event_key,
  count(*) as total,
  min(received_at) as first_received_at,
  max(received_at) as last_received_at
from app.webhook_logs
where event_key is not null
group by account_id, provider, event_key
having count(*) > 1
order by total desc, account_id, provider, event_key;
```

### 1.2 `app.tracking_events(account_id, shipment_id, external_event_id)`
```sql
select
  account_id,
  shipment_id,
  external_event_id,
  count(*) as total,
  min(occurred_at) as first_occurred_at,
  max(occurred_at) as last_occurred_at
from app.tracking_events
where external_event_id is not null
group by account_id, shipment_id, external_event_id
having count(*) > 1
order by total desc, account_id, shipment_id, external_event_id;
```

### 1.3 `app.sync_jobs(account_id, kind, idempotency_key)`
```sql
select
  account_id,
  kind,
  idempotency_key,
  count(*) as total,
  min(created_at) as first_created_at,
  max(created_at) as last_created_at
from app.sync_jobs
where idempotency_key is not null
group by account_id, kind, idempotency_key
having count(*) > 1
order by total desc, account_id, kind, idempotency_key;
```

## 2) Plano seguro de saneamento (antes de produção)

1. **Executar diagnóstico** e registrar volume por chave duplicada.
2. **Backup lógico** das 3 tabelas (`webhook_logs`, `tracking_events`, `sync_jobs`) antes de saneamento.
3. **Validar regra de retenção**: manter o registro mais antigo por chave de idempotência/evento.
4. **Aplicar migration `005_homologation_fixes.sql`** (agora inclui deduplicação controlada e criação dos índices).
5. **Reexecutar diagnóstico** para confirmar `0` duplicados.
6. **Monitorar erros de ingestão** por 24h para confirmar comportamento esperado dos produtores.

## 3) Migration complementar

A deduplicação controlada foi incorporada na própria `supabase/migrations/005_homologation_fixes.sql`, imediatamente antes da criação dos índices únicos, para garantir aplicabilidade segura em ambientes com histórico.
