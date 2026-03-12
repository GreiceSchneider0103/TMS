import pg from 'pg';
import { computeBackoffMs, isDeadLetter } from './retryPolicy.js';
import { TinyWorkerClient } from './tinyApiClient.js';

const tinyTimeoutMs = Number(process.env.TINY_TIMEOUT_MS || 15000);
const tinyStatusPathTemplate = process.env.TINY_ORDER_STATUS_PATH_TEMPLATE || '/orders/{externalOrderId}/status';

export async function buildTinyStatusPayload(shipment) {
  return {
    pedido_id: shipment.external_order_id,
    codigo_rastreio: shipment.tracking_code,
    transportadora: shipment.carrier_name,
    status: shipment.status,
    entregue_em: shipment.delivered_at || null
  };
}

export async function runTinySyncBatch(limit = 50, options = {}) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const tinyClient = new TinyWorkerClient({
    baseUrl: process.env.TINY_BASE_URL,
    token: process.env.TINY_API_TOKEN,
    timeoutMs: Number(process.env.TINY_TIMEOUT_MS || 15000)
  });
  const summary = { picked: 0, success: 0, error: 0, dead_letter: 0 };
  const startedAt = Date.now();
  try {
    const jobs = await client.query(
      `with picked as (
         select id
         from app.sync_jobs
         where kind = 'tiny_status_sync' and dead_letter = false
           and status in ('pending','error') and attempts < 8
           and coalesce(next_retry_at, now()) <= now()
         order by created_at asc
         for update skip locked
         limit $1
       )
       update app.sync_jobs sj
       set status = 'processing', updated_at = now()
       from picked
       where sj.id = picked.id
       returning sj.*`,
      [limit]
    );
    summary.picked = jobs.rows.length;

    for (const job of jobs.rows) {
      const attempts = job.attempts + 1;
      const correlationId = job.correlation_id || cryptoRandom();
      try {
        await client.query('update app.sync_jobs set attempts = $1, correlation_id = $2, updated_at = now() where id = $3', [attempts, correlationId, job.id]);
        const data = await tinyClient.updateOrderStatus({
          externalOrderId: job.external_ref,
          payload: job.payload,
          correlationId
        });
        await client.query('update app.sync_jobs set status = $1, response = $2, error = null, updated_at = now(), next_retry_at = null, correlation_id = $3 where id = $4', ['success', data, correlationId, job.id]);
        summary.success += 1;
      } catch (error) {
        const delayMs = computeBackoffMs(attempts);
        const deadLetter = isDeadLetter(attempts);
        const errorPayload = {
          message: error.message,
          code: error.code || null,
          provider_status: error.providerStatus || null,
          provider_body: error.providerBody || null
        };
        await client.query(
          `update app.sync_jobs set status = $1, error = $2, attempts = $3, updated_at = now(),
             next_retry_at = now() + ($4 || ' milliseconds')::interval, dead_letter = $5, correlation_id = $6 where id = $7`,
          [deadLetter ? 'dead_letter' : 'error', JSON.stringify(errorPayload), attempts, String(delayMs), deadLetter, correlationId, job.id]
        );
        logWorkerEvent(deadLetter ? 'tiny_sync_dead_letter' : 'tiny_sync_retry', {
          job_id: job.id,
          attempts,
          delay_ms: delayMs,
          correlation_id: correlationId,
          error: errorPayload
        });
        if (deadLetter) summary.dead_letter += 1;
        else summary.error += 1;
      }
    }

    logWorkerEvent('tiny_sync_batch_done', {
      ...summary,
      duration_ms: Date.now() - startedAt,
      ...(options.workerName ? { worker: options.workerName } : {})
    });
    return summary;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function runTinySyncWorker({ batchLimit = 50, intervalMs = 10000, maxCycles = null, logger = console } = {}) {
  assertTinyWorkerConfig();

  let cycles = 0;
  let running = true;
  const stop = () => {
    running = false;
  };

  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  while (running) {
    cycles += 1;
    const startedAt = new Date().toISOString();
    try {
      const summary = await runTinySyncBatch(batchLimit);
      logger.info(JSON.stringify({ worker: 'tinySync', event: 'cycle_ok', startedAt, summary }));
    } catch (error) {
      logger.error(JSON.stringify({ worker: 'tinySync', event: 'cycle_error', startedAt, error: error.message, meta: error.meta || null }));
    }

    if (maxCycles && cycles >= maxCycles) break;
    if (!running) break;
    await sleep(intervalMs);
  }

  process.off('SIGTERM', stop);
  process.off('SIGINT', stop);
}

function assertTinyWorkerConfig() {
  if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
  if (!process.env.TINY_BASE_URL) throw new Error('Missing TINY_BASE_URL');
  if (!process.env.TINY_API_TOKEN) throw new Error('Missing TINY_API_TOKEN');
}

function tinyStatusUrl(externalOrderId) {
  const path = tinyStatusPathTemplate.replace('{externalOrderId}', encodeURIComponent(String(externalOrderId || '')));
  return new URL(path, process.env.TINY_BASE_URL);
}

async function postTinyStatus({ url, body, correlationId }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), tinyTimeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.TINY_API_TOKEN}`,
        'content-type': 'application/json',
        'x-correlation-id': correlationId
      },
      body: JSON.stringify(body || {})
    });
    const payload = await readJsonSafe(response);
    return { status: response.status, payload };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw syncError('Tiny sync timeout', { timeoutMs: tinyTimeoutMs, url: String(url) });
    }
    throw syncError('Tiny sync request error', { url: String(url), cause: error?.message || String(error) });
  } finally {
    clearTimeout(timeout);
  }
}

function syncError(message, meta = {}) {
  const err = new Error(message);
  err.meta = meta;
  return err;
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cryptoRandom() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function logWorkerEvent(event, payload) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...payload
  }));
}
