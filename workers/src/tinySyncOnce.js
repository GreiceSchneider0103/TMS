import './loadLocalEnv.js';
import { runTinySyncBatch } from './tinySync.js';

const workerName = process.env.WORKER_NAME || 'tiny-sync-worker-once';
const maxBatch = Number(process.env.WORKER_TINY_SYNC_BATCH_SIZE || 50);

assertEnv();

runTinySyncBatch(maxBatch, { workerName })
  .then((summary) => {
    log('tiny_sync_cycle_done', summary);
    process.exit(0);
  })
  .catch((error) => {
    log('tiny_sync_cycle_error', { message: error.message, code: error.code || null });
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
