import pg from 'pg';
import { RteClient, extractRteEvents, extractRteShipmentKeys } from './carriers/rte.js';
import { persistPolledTrackingEvent } from './trackingPolling.js';
import { loadCarrierCredentials } from './carrierCredentials.js';

const state = {
  stopping: false,
  inFlight: false,
  lastRunAt: null,
  lastSummary: null,
  consecutiveFailures: 0
};

assertEnv();

const config = {
  workerName: process.env.WORKER_NAME || 'tracking-polling-worker-rte',
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS || 900000),
  idleBackoffMs: Number(process.env.WORKER_IDLE_BACKOFF_MS || 30000),
  failureBackoffMs: Number(process.env.WORKER_FAILURE_BACKOFF_MS || 60000),
  lookbackDays: Number(process.env.RTE_LOOKBACK_DAYS || 30)
};

setupSignals();

// Carrier id + API credentials come from app.carriers / Supabase Vault
// (see carrierCredentials.js), not from Render environment variables, so
// rotating a password or (de)activating this carrier is a DB change, not a
// redeploy. Node's top-level await (this file is loaded as an ES module)
// lets startup block on this before entering the poll loop.
const { carrierId, credentials } = await loadCarrierCredentials('rte');
config.carrierId = carrierId;

log('worker_start', { config });

const rteClient = new RteClient({
  username: credentials.username,
  password: credentials.password,
  taxIdRegistration: credentials.tax_id_registration
});

void loop();

async function loop() {
  while (!state.stopping) {
    const startedAt = Date.now();
    state.inFlight = true;
    try {
      const summary = await runRteCycle();

      state.lastRunAt = new Date().toISOString();
      state.lastSummary = summary;
      state.consecutiveFailures = 0;
      log('tracking_polling_cycle_done', { ...summary });

      if (summary.matched === 0) await sleep(config.idleBackoffMs);
    } catch (error) {
      state.consecutiveFailures += 1;
      log('worker_cycle_error', {
        message: error.message,
        code: error.code || null,
        status: error.status || null,
        consecutive_failures: state.consecutiveFailures
      });
      await sleep(config.failureBackoffMs);
    } finally {
      state.inFlight = false;
      const elapsed = Date.now() - startedAt;
      const waitMs = Math.max(0, config.pollIntervalMs - elapsed);
      if (!state.stopping && waitMs > 0) await sleep(waitMs);
    }
  }

  log('worker_stopped', {
    in_flight: state.inFlight,
    last_run_at: state.lastRunAt,
    last_summary: state.lastSummary
  });
}

async function runRteCycle() {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - config.lookbackDays * 24 * 60 * 60 * 1000);
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);

  const records = await rteClient.fetchBatchByOccurrenceDate({
    startDate: startDateStr,
    endDate: endDateStr
  });

  log('rte_batch_fetched', { records: records.length, startDate: startDateStr, endDate: endDateStr });

  if (records.length === 0) {
    return { records: 0, matched: 0, processed: 0, errors: 0 };
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
          [config.carrierId, cteNumber, invoiceNumbers.length ? invoiceNumbers : null]
        );
        const shipment = shipmentResult.rows[0];
        if (!shipment) {
          continue;
        }
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
        log('rte_record_error', {
          cte_number: cteNumber,
          invoice_numbers: invoiceNumbers,
          message: error.message
        });
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  return { records: records.length, matched, processed, errors };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function setupSignals() {
  process.on('SIGTERM', () => {
    log('worker_signal', { signal: 'SIGTERM' });
    state.stopping = true;
  });

  process.on('SIGINT', () => {
    log('worker_signal', { signal: 'SIGINT' });
    state.stopping = true;
  });

  process.on('uncaughtException', (error) => {
    log('worker_uncaught_exception', { message: error.message, stack: error.stack });
    state.stopping = true;
  });

  process.on('unhandledRejection', (reason) => {
    log('worker_unhandled_rejection', { reason: String(reason) });
    state.stopping = true;
  });
}

function assertEnv() {
  // Only DATABASE_URL is required here now: carrier credentials and the
  // carrier id are loaded from the database (Supabase Vault) at startup.
  const required = ['DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'worker_config_error', missing }));
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(event, payload = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, worker: config.workerName, ...payload }));
}
