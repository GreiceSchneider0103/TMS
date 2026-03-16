const DEFAULT_ALLOWED_HEADERS = ['content-type', 'x-api-key', 'x-correlation-id'];
const DEFAULT_ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

export function applyCors(req, res) {
  const origin = req.headers.origin ? String(req.headers.origin) : null;
  if (!origin) return { allowed: false, origin: null };

  const allowedOrigin = resolveAllowedOrigin(origin);
  if (!allowedOrigin) return { allowed: false, origin };

  const allowedHeaders = resolveAllowedHeaders();

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS.join(', '));
  res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', '600');

  return { allowed: true, origin: allowedOrigin };
}

function resolveAllowedOrigin(origin) {
  const configured = parseConfiguredOrigins();
  if (configured.length > 0) {
    for (const rule of configured) {
      if (rule === '*') return origin;
      if (matchesOriginRule(origin, rule)) return origin;
    }
    return null;
  }

  return isDevDefaultAllowed(origin) ? origin : null;
}

function parseConfiguredOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveAllowedHeaders() {
  const raw = String(process.env.CORS_ALLOWED_HEADERS || '').trim();
  if (!raw) return DEFAULT_ALLOWED_HEADERS;
  return raw
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function matchesOriginRule(origin, rule) {
  if (rule.includes('*')) {
    const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(origin);
  }
  return origin === rule;
}

function isDevDefaultAllowed(origin) {
  const devDefaults = [
    /^https?:\/\/localhost(?::\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
    /^https?:\/\/.*\.app\.github\.dev$/,
    /^https?:\/\/.*\.github\.dev$/
  ];
  return devDefaults.some((rx) => rx.test(origin));
}
