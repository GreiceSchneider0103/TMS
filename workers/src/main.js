import { runTinySyncBatch } from './tinySync.js';

const state = {
  stopping: false,
  inFlight: false,
  lastRunAt: null,
  lastSummary: null,
  consecutiveFailures: 0
};

const config = {
  workerName: process.env.WORKER_NAME || 'tiny-sync-worker',
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS || 5000),
  maxBatch: Number(process.env.WORKER_TINY_SYNC_BATCH_SIZE || 50),
  idleBackoffMs: Number(process.env.WORKER_IDLE_BACKOFF_MS || 2000),
  failureBackoffMs: Number(process.env.WORKER_FAILURE_BACKOFF_MS || 7000)
};

assertEnv();
setupSignals();
log('worker_start', { config });
void loop();

async function loop() {
  while (!state.stopping) {
    const startedAt = Date.now();
    state.inFlight = true;
    try {
      const summary = await runTinySyncBatch(config.maxBatch, { workerName: config.workerName });
      state.lastRunAt = new Date().toISOString();
      state.lastSummary = summary;
      state.consecutiveFailures = 0;

      if (summary.picked === 0) {
        await sleep(config.idleBackoffMs);
      }
    } catch (error) {
      state.consecutiveFailures += 1;
      log('worker_cycle_error', {
        message: error.message,
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
