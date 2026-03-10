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

export async function persistPolledTrackingEvent({ accountId, shipmentId, externalEventId, status, payload, occurredAt }) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const macro = normalizeTrackingStatus(status);
    const inserted = await client.query(
      `insert into app.tracking_events(account_id, shipment_id, occurred_at, external_status, macro_status, raw_payload, external_event_id)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict(account_id, shipment_id, external_event_id) do nothing
       returning *`,
      [accountId, shipmentId, occurredAt || new Date().toISOString(), status, macro, payload || {}, externalEventId]
    );
    if (inserted.rows[0]) {
      await client.query(
        `update app.shipments set status = $1, updated_at = now(), delivered_at = case when $1 = 'DELIVERED' then now() else delivered_at end
         where account_id = $2 and id = $3`,
        [macro, accountId, shipmentId]
      );
    }
    return inserted.rows[0] || null;
  } finally {
    client.release();
    await pool.end();
  }
}
