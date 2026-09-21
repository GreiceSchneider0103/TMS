import { runTrackingPollingCycle } from './trackingPolling.js';
import { TinyTrackingClient } from './tinyTrackingClient.js';

const state = {
  stopping: false,
  inFlight: false,
  lastRunAt: null,
  lastSummary: null,
  consecutiveFailures: 0
};

const config = {
  workerName: process.env.WORKER_NAME || 'tracking-polling-worker',
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS || 10000),
  maxBatch: Number(process.env.WORKER_TRACKING_BATCH_SIZE || 100),
  idleBackoffMs: Number(process.env.WORKER_IDLE_BACKOFF_MS || 2000),
  failureBackoffMs: Number(process.env.WORKER_FAILURE_BACKOFF_MS || 7000),
  tinyTrackingPathTemplate: process.env.TINY_TRACKING_EVENTS_PATH || '/shipments/{trackingCode}/events'
};

assertEnv();
setupSignals();
log('worker_start', { config });

const tinyTrackingClient = new TinyTrackingClient({
  baseUrl: process.env.TINY_BASE_URL,
  token: process.env.TINY_API_TOKEN,
  timeoutMs: Number(process.env.TINY_TIMEOUT_MS || 15000),
  pathTemplate: config.tinyTrackingPathTemplate
});

void loop();

async function loop() {
  while (!state.stopping) {
    const startedAt = Date.now();
    state.inFlight = true;
    try {
      const summary = await runTrackingPollingCycle(async (shipment) => {
        const correlationId = `${config.workerName}-${shipment.id}-${Date.now()}`;
        const events = await tinyTrackingClient.listTrackingEvents({ trackingCode: shipment.tracking_code, correlationId });
        log('tracking_fetch_done', {
          shipment_id: shipment.id,
          tracking_code: shipment.tracking_code,
          fetched_events: events.length,
          correlation_id: correlationId
        });
        return events;
      }, config.maxBatch);

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
        provider_status: error.providerStatus || null,
        provider_body: error.providerBody || null,
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
  const required = ['DATABASE_URL', 'TINY_BASE_URL', 'TINY_API_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    log('worker_config_error', { missing });
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(event, payload = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, worker: config.workerName, ...payload }));
}
