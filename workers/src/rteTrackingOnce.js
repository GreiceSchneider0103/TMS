import './loadLocalEnv.js';
import pg from 'pg';
import { RteClient, extractRteEvents, extractRteShipmentKeys } from './carriers/rte.js';
import { persistPolledTrackingEvent } from './trackingPolling.js';
import { loadCarrierCredentials } from './carrierCredentials.js';

const workerName = process.env.WORKER_NAME || 'tracking-polling-worker-rte-once';
const lookbackDays = Number(process.env.RTE_LOOKBACK_DAYS || 30);

assertEnv();

main().then(() => process.exit(0)).catch((error) => {
  log('worker_cycle_error', {
    message: error.message,
    code: error.code || null,
    status: error.status || null
  });
  process.exit(1);
});

async function main() {
  const { carrierId, credentials } = await loadCarrierCredentials('rte');
  const rteClient = new RteClient({
    username: credentials.username,
    password: credentials.password,
    taxIdRegistration: credentials.tax_id_registration
  });

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);

  const records = await rteClient.fetchBatchByOccurrenceDate({
    startDate: startDateStr,
    endDate: endDateStr
  });
  log('rte_batch_fetched', { records: records.length, startDate: startDateStr, endDate: endDateStr });

  if (records.length === 0) {
    log('tracking_polling_cycle_done', { records: 0, matched: 0, processed: 0, errors: 0 });
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let matched = 0;
  let processed = 0;
  let errors = 0;

  try {
    for (const record of records) {
      const { cteNumber, invoiceNumbers } = extractRteShipmentKeys(record);
      try {
        const shipmentResult = await client.query(
          `select * from app.shipments
           where carrier_id = $1
             and (cte_number = $2 or invoice_number = any($3::text[]))
           limit 1`,
          [carrierId, cteNumber, invoiceNumbers.length ? invoiceNumbers : null]
        );
        const shipment = shipmentResult.rows[0];
        if (!shipment) continue;
        matched += 1;

        const events = extractRteEvents(record);
        for (const evt of events) {
          const saved = await persistPolledTrackingEvent({
            accountId: shipment.account_id,
            shipmentId: shipment.id,
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
        log('rte_record_error', { cte_number: cteNumber, invoice_numbers: invoiceNumbers, message: error.message });
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  log('tracking_polling_cycle_done', { records: records.length, matched, processed, errors });
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function assertEnv() {
  const required = ['DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    log('worker_config_error', { missing });
    process.exit(1);
  }
}

function log(event, payload = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, worker: workerName, ...payload }));
}
