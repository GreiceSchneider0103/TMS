import { HttpError } from './router.js';

const buckets = new Map();

export function applyRateLimit(req) {
  const keyParts = [resolveBucket(req), getClientIp(req), getApiKeyFingerprint(req) || 'anon'];
  const key = keyParts.join(':');
  const now = Date.now();
  const { max, windowMs } = resolveRule(req);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;
  if (current.count > max) {
    const retrySeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    const err = new HttpError(429, `Rate limit exceeded for ${resolveBucket(req)}`);
    err.code = 'RATE_LIMITED';
    err.retryAfter = retrySeconds;
    throw err;
  }
}

function resolveBucket(req) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/auth/login') || url.pathname.startsWith('/auth/session')) return 'auth';
  if (url.pathname.startsWith('/tracking/webhook')) return 'webhook';
  return 'api';
}

function resolveRule(req) {
  const bucket = resolveBucket(req);
  if (bucket === 'auth') return { max: Number(process.env.RATE_LIMIT_AUTH_MAX || 5), windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 60_000) };
  if (bucket === 'webhook') return { max: Number(process.env.RATE_LIMIT_WEBHOOK_MAX || 60), windowMs: Number(process.env.RATE_LIMIT_WEBHOOK_WINDOW_MS || 60_000) };
  return { max: Number(process.env.RATE_LIMIT_API_MAX || 120), windowMs: Number(process.env.RATE_LIMIT_API_WINDOW_MS || 60_000) };
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function getApiKeyFingerprint(req) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return null;
  const value = String(apiKey);
  return value.slice(0, 6);
}
