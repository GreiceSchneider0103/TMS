import { runTinySyncWorker } from './tinySync.js';
import { runTrackingPollingWorker } from './trackingPolling.js';

const mode = process.env.WORKER_MODE || 'all';

async function main() {
  if (mode === 'tiny') {
    await runTinySyncWorker({
      batchLimit: Number(process.env.TINY_SYNC_BATCH_LIMIT || 50),
      intervalMs: Number(process.env.TINY_SYNC_INTERVAL_MS || 10000)
    });
    return;
  }

  if (mode === 'tracking') {
    await runTrackingPollingWorker({
      fetchUpdates: fetchTrackingUpdates,
      limit: Number(process.env.TRACKING_POLL_LIMIT || 100),
      intervalMs: Number(process.env.TRACKING_POLL_INTERVAL_MS || 30000)
    });
    return;
  }

  await Promise.all([
    runTinySyncWorker({
      batchLimit: Number(process.env.TINY_SYNC_BATCH_LIMIT || 50),
      intervalMs: Number(process.env.TINY_SYNC_INTERVAL_MS || 10000)
    }),
    runTrackingPollingWorker({
      fetchUpdates: fetchTrackingUpdates,
      limit: Number(process.env.TRACKING_POLL_LIMIT || 100),
      intervalMs: Number(process.env.TRACKING_POLL_INTERVAL_MS || 30000)
    })
  ]);
}

async function fetchTrackingUpdates(shipment) {
  const template = process.env.TRACKING_POLL_URL_TEMPLATE;
  if (!template) return [];

  const token = process.env.TRACKING_POLL_TOKEN || null;
  const url = template
    .replace('{shipmentId}', encodeURIComponent(String(shipment.id)))
    .replace('{trackingCode}', encodeURIComponent(String(shipment.tracking_code || '')));

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`tracking poll failed: ${response.status}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.events)) return payload.events;
  return [];
}

main().catch((error) => {
  console.error(JSON.stringify({ worker: 'runner', event: 'fatal', error: error.message }));
  process.exit(1);
});
