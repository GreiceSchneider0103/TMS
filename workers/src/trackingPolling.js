import pg from 'pg';

const statusMap = {
  posted: 'DISPATCHED',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  exception: 'EXCEPTION',
  returned: 'RETURNED',
  canceled: 'CANCELED'
};

export function normalizeTrackingStatus(externalStatus) {
  return statusMap[String(externalStatus || '').toLowerCase()] || 'IN_TRANSIT';
}

export async function persistPolledTrackingEvent({ accountId, shipmentId, externalEventId, status, payload, occurredAt, client = null }) {
  const ownPool = !client;
  const pool = ownPool ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
  const conn = client || await pool.connect();
  try {
    const macro = normalizeTrackingStatus(status);
    const inserted = await conn.query(
      `insert into app.tracking_events(account_id, shipment_id, occurred_at, external_status, macro_status, raw_payload, external_event_id)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict(account_id, shipment_id, external_event_id) do nothing
       returning *`,
      [accountId, shipmentId, occurredAt || new Date().toISOString(), status, macro, payload || {}, externalEventId]
    );
    if (inserted.rows[0]) {
      await conn.query(
        `update app.shipments set status = $1, updated_at = now(), delivered_at = case when $1 = 'DELIVERED' then now() else delivered_at end
         where account_id = $2 and id = $3`,
        [macro, accountId, shipmentId]
      );
    }
    return inserted.rows[0] || null;
  } finally {
    if (ownPool) {
      conn.release();
      await pool.end();
    }
  }
}

export async function runTrackingPollingCycle(fetchUpdates, limit = 100) {
  if (typeof fetchUpdates !== 'function') throw new Error('fetchUpdates function is required');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const shipments = await client.query(
      `select * from app.shipments
       where status in ('DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY')
       order by updated_at asc limit $1`,
      [limit]
    );
    let processed = 0;
    for (const s of shipments.rows) {
      const events = await fetchUpdates(s);
      if (!Array.isArray(events)) continue;
      for (const evt of events) {
        if (!evt?.id) continue;
        const saved = await persistPolledTrackingEvent({
          accountId: s.account_id,
          shipmentId: s.id,
          externalEventId: evt.id,
          status: evt.status,
          payload: evt,
          occurredAt: evt.occurredAt,
          client
        });
        if (saved) processed += 1;
      }
    }
    return { shipments: shipments.rows.length, processed };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function runTrackingPollingWorker({ fetchUpdates, limit = 100, intervalMs = 30000, maxCycles = null, logger = console } = {}) {
  if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
  if (typeof fetchUpdates !== 'function') throw new Error('fetchUpdates function is required');

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
      const summary = await runTrackingPollingCycle(fetchUpdates, limit);
      logger.info(JSON.stringify({ worker: 'trackingPolling', event: 'cycle_ok', startedAt, summary }));
    } catch (error) {
      logger.error(JSON.stringify({ worker: 'trackingPolling', event: 'cycle_error', startedAt, error: error.message }));
    }

    if (maxCycles && cycles >= maxCycles) break;
    if (!running) break;
    await sleep(intervalMs);
  }

  process.off('SIGTERM', stop);
  process.off('SIGINT', stop);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
