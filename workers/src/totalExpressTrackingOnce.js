import './loadLocalEnv.js';
import { runTrackingPollingCycle } from './trackingPolling.js';
import { TotalExpressClient, extractTotalExpressEvents } from './carriers/totalExpress.js';
import { loadCarrierCredentials } from './carrierCredentials.js';

const workerName = process.env.WORKER_NAME || 'tracking-polling-worker-total-express-once';
const maxBatch = Number(process.env.WORKER_TRACKING_BATCH_SIZE || 100);

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
  const { carrierId, credentials } = await loadCarrierCredentials('total_express');
  const totalExpressClient = new TotalExpressClient({
    user: credentials.user,
    password: credentials.password,
    remetenteId: credentials.remetente_id
  });

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
  }, maxBatch, { carrierId });

  log('tracking_polling_cycle_done', summary);
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
