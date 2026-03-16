import { HttpError } from './router.js';

export function enforceAbuseProtection(req) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'POST' || !isCriticalPath(url.pathname)) return;

  // Webhooks already have event-level deduplication in route persistence.
  if (url.pathname.startsWith('/tracking/webhook')) return;

  const idem = req.headers['x-idempotency-key'];
  if (!idem || String(idem).trim().length < 8) {
    throw new HttpError(400, 'Missing or invalid x-idempotency-key');
  }
}

function isCriticalPath(pathname) {
  return pathname.startsWith('/orders/import')
    || pathname.startsWith('/quotes')
    || pathname.startsWith('/shipments')
    || pathname.startsWith('/tracking/webhook');
}
