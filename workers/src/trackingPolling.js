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

// Canonical values of the app.shipments.status enum. Carrier adapters
// (Total Express, RTE, ...) already normalize their own raw provider
// statuses into this vocabulary, so those values must pass through
// untouched here. Without this check, e.g. a carrier-normalized
// "DISPATCHED" would fail to match any statusMap key (only the
// Tiny-specific lowercase "posted" does) and silently fall back to the
// default IN_TRANSIT below -- exactly the dispatch signal this project
// needs to capture correctly.
const MACRO_STATUSES = new Set([
  'CREATED',
  'QUOTED',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'RETURNED',
  'CANCELED'
]);

export function normalizeTrackingStatus(externalStatus) {
  const raw = String(externalStatus || '');
  const upper = raw.toUpperCase();
  if (MACRO_STATUSES.has(upper)) {
    return upper;
  }
  return statusMap[raw.toLowerCase()] || 'IN_TRANSIT';
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
      // $1 is cast explicitly in both places it appears: left uncast,
      // Postgres tries to unify the "status = $1" (app.shipment_status enum)
      // and "$1 = 'DELIVERED'" (defaults to text) contexts and fails with
      // "inconsistent types deduced for parameter $1" (42P08), silently
      // aborting the status update on every event insert that reaches here.
      await conn.query(
        `update app.shipments set status = $1::app.shipment_status, updated_at = now(), delivered_at = case when $1::app.shipment_status = 'DELIVERED' then now() else delivered_at end
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

export async function runTrackingPollingCycle(fetchUpdates, limit = 100, options = {}) {
  if (typeof fetchUpdates !== 'function') throw new Error('fetchUpdates function is required');
  const { carrierId = null } = options;

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const params = carrierId ? [limit, carrierId] : [limit];
    const shipments = await client.query(
      `select * from app.shipments
       where status in ('DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY')
       ${carrierId ? 'and carrier_id = $2' : ''}
       order by updated_at asc limit $1`,
      params
    );
    let processed = 0;
    let errors = 0;
    for (const s of shipments.rows) {
      try {
        const events = await fetchUpdates(s);
        for (const evt of events || []) {
          const saved = await persistPolledTrackingEvent({
            accountId: s.account_id,
            shipmentId: s.id,
            externalEventId: evt.id,
            status: evt.status,
            payload: evt.raw || evt,
            occurredAt: evt.occurredAt,
            client
          });
          if (saved) processed += 1;
        }
      } catch (error) {
        errors += 1;
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          event: 'tracking_polling_shipment_error',
          shipment_id: s.id,
          tracking_code: s.tracking_code,
          error: error.message,
          code: error.code || null,
          provider_status: error.providerStatus || null,
          detail: error.detail || null,
          hint: error.hint || null,
          position: error.position || null,
          where: error.where || null
        }));
      }
    }
    return { shipments: shipments.rows.length, processed, errors };
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
