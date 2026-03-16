# Pré-validação de duplicados e regra objetiva de retenção

## Diagnóstico

### `app.webhook_logs(account_id, provider, event_key)`
```sql
select account_id, provider, event_key, count(*) as total
from app.webhook_logs
where event_key is not null
group by account_id, provider, event_key
having count(*) > 1
order by total desc, account_id, provider, event_key;
```

### `app.tracking_events(account_id, shipment_id, external_event_id)`
```sql
select account_id, shipment_id, external_event_id, count(*) as total
from app.tracking_events
where external_event_id is not null
group by account_id, shipment_id, external_event_id
having count(*) > 1
order by total desc, account_id, shipment_id, external_event_id;
```

### `app.sync_jobs(account_id, kind, idempotency_key)`
```sql
select account_id, kind, idempotency_key, count(*) as total
from app.sync_jobs
where idempotency_key is not null
group by account_id, kind, idempotency_key
having count(*) > 1
order by total desc, account_id, kind, idempotency_key;
```

## Regra adotada na migration

- `webhook_logs`: **mantém o mais recente** (`processed_at/received_at`) para preservar estado final de processamento.
- `tracking_events`: **mantém o mais antigo** (`occurred_at`) para preservar ordem histórica do evento.
- `sync_jobs`: **consolida campos operacionais** (`status`, `attempts`, `response`, `error`, `dead_letter`, `next_retry_at`, `correlation_id`, `updated_at`) no registro canônico e remove duplicados restantes.
