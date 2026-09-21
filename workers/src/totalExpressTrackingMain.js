import { runTrackingPollingCycle } from './trackingPolling.js';
import { TotalExpressClient, extractTotalExpressEvents } from './carriers/totalExpress.js';
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
  workerName: process.env.WORKER_NAME || 'tracking-polling-worker-total-express',
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS || 30000),
  maxBatch: Number(process.env.WORKER_TRACKING_BATCH_SIZE || 100),
  idleBackoffMs: Number(process.env.WORKER_IDLE_BACKOFF_MS || 5000),
  failureBackoffMs: Number(process.env.WORKER_FAILURE_BACKOFF_MS || 10000)
};

setupSignals();

// Carrier id + API credentials come from app.carriers / Supabase Vault
// (see carrierCredentials.js), not from Render environment variables, so
// rotating a password or (de)activating this carrier is a DB change, not a
// redeploy. Node's top-level await (this file is loaded as an ES module)
// lets startup block on this before entering the poll loop.
const { carrierId, credentials } = await loadCarrierCredentials('total_express');
config.carrierId = carrierId;

log('worker_start', { config });

const totalExpressClient = new TotalExpressClient({
  user: credentials.user,
  password: credentials.password,
  remetenteId: credentials.remetente_id
});

void loop();

async function loop() {
  while (!state.stopping) {
    const startedAt = Date.now();
    state.inFlight = true;
    try {
      const summary = await runTrackingPollingCycle(async (shipment) => {
        if (!shipment.invoice_number) {
          log('tracking_fetch_skip_no_invoice', { shipment_id: shipment.id });
          return [];
        }
        const response = await totalExpressClient.fetchTracking({ numeroNF: shipment.invoice_number });
        const events = extractTotalExpressEvents(response);
        log('tracking_fetch_done', {
          shipment_id: shipment.id,
          invoice_number: shipment.invoice_number,
          fetched_events: events.length
        });
        return events;
      }, config.maxBatch, { carrierId: config.carrierId });

      state.lastRunAt = new Date().toISOString();
      state.lastSummary = summary;
      state.consecutiveFailures = 0;
      log('tracking_polling_cycle_done', { ...summary });

      if (summary.shipments === 0) await sleep(config.idleBackoffMs);
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
