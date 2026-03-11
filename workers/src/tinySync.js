import pg from 'pg';
import { computeBackoffMs, isDeadLetter } from './retryPolicy.js';

export async function buildTinyStatusPayload(shipment) {
  return {
    pedido_id: shipment.external_order_id,
    codigo_rastreio: shipment.tracking_code,
    transportadora: shipment.carrier_name,
    status: shipment.status,
    entregue_em: shipment.delivered_at || null
  };
}

export async function runTinySyncBatch(limit = 50) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const summary = { picked: 0, success: 0, error: 0, dead_letter: 0 };
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
        const response = await fetch(new URL(`/orders/${job.external_ref}/status`, process.env.TINY_BASE_URL), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.TINY_API_TOKEN}`,
            'content-type': 'application/json',
            'x-correlation-id': correlationId
          },
          body: JSON.stringify(job.payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`Tiny sync failed: ${response.status}`);
        await client.query('update app.sync_jobs set status = $1, response = $2, updated_at = now(), next_retry_at = null, correlation_id = $3 where id = $4', ['success', data, correlationId, job.id]);
        summary.success += 1;
      } catch (error) {
        const delayMs = computeBackoffMs(attempts);
        const deadLetter = isDeadLetter(attempts);
        await client.query(
          `update app.sync_jobs set status = $1, error = $2, attempts = $3, updated_at = now(),
             next_retry_at = now() + ($4 || ' milliseconds')::interval, dead_letter = $5, correlation_id = $6 where id = $7`,
          [deadLetter ? 'dead_letter' : 'error', error.message, attempts, String(delayMs), deadLetter, correlationId, job.id]
        );
        if (deadLetter) summary.dead_letter += 1;
        else summary.error += 1;
      }
    }
    return summary;
  } finally {
    client.release();
    await pool.end();
  }
}

function cryptoRandom() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
