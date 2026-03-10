import pg from 'pg';

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
  try {
    const jobs = await client.query(
      `select * from app.sync_jobs
       where kind = 'tiny_status_sync' and status in ('pending','error') and attempts < 5
       order by created_at asc
       limit $1`,
      [limit]
    );

    for (const job of jobs.rows) {
      const attempts = job.attempts + 1;
      const correlationId = job.correlation_id || cryptoRandom();
      try {
        await client.query('update app.sync_jobs set status = $1, attempts = $2, updated_at = now(), correlation_id = $3 where id = $4', ['processing', attempts, correlationId, job.id]);
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
        await client.query('update app.sync_jobs set status = $1, response = $2, updated_at = now(), correlation_id = $3 where id = $4', ['success', data, correlationId, job.id]);
        await client.query(
          `insert into app.audit_logs(account_id, entity, entity_id, action, after_data, correlation_id)
           values($1,'sync_job',$2,'tiny_sync_success',$3,$4)`,
          [job.account_id, job.id, { externalRef: job.external_ref }, correlationId]
        );
      } catch (error) {
        await client.query('update app.sync_jobs set status = $1, error = $2, attempts = $3, updated_at = now(), correlation_id = $4 where id = $5', ['error', error.message, attempts, correlationId, job.id]);
      }
    }
    return { processed: jobs.rows.length };
  } finally {
    client.release();
    await pool.end();
  }
}

function cryptoRandom() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
