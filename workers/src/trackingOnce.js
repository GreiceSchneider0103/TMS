import './loadLocalEnv.js';
import { runTrackingPollingCycle } from './trackingPolling.js';
import { TinyTrackingClient } from './tinyTrackingClient.js';

const workerName = process.env.WORKER_NAME || 'tracking-polling-worker-once';
const maxBatch = Number(process.env.WORKER_TRACKING_BATCH_SIZE || 100);
const tinyTrackingPathTemplate = process.env.TINY_TRACKING_EVENTS_PATH || '/shipments/{trackingCode}/events';

assertEnv();

const tinyTrackingClient = new TinyTrackingClient({
  baseUrl: process.env.TINY_BASE_URL,
  token: process.env.TINY_API_TOKEN,
  timeoutMs: Number(process.env.TINY_TIMEOUT_MS || 15000),
  pathTemplate: tinyTrackingPathTemplate
});

runTrackingPollingCycle(async (shipment) => {
  const correlationId = `${workerName}-${shipment.id}-${Date.now()}`;
  const events = await tinyTrackingClient.listTrackingEvents({ trackingCode: shipment.tracking_code, correlationId });
  log('tracking_fetch_done', {
    shipment_id: shipment.id,
    tracking_code: shipment.tracking_code,
    fetched_events: events.length,
    correlation_id: correlationId
  });
  return events;
}, maxBatch)
  .then((summary) => {
    log('tracking_polling_cycle_done', summary);
    process.exit(0);
  })
  .catch((error) => {
    log('worker_cycle_error', {
      message: error.message,
      code: error.code || null,
      provider_status: error.providerStatus || null
    });
    process.exit(1);
  });

function assertEnv() {
  const required = ['DATABASE_URL', 'TINY_BASE_URL', 'TINY_API_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    log('worker_config_error', { missing });
    process.exit(1);
  }
}

function log(event, payload = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, worker: workerName, ...payload }));
}
