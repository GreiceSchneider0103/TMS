const DEFAULT_ALLOWED_HEADERS = ['content-type', 'x-api-key', 'x-correlation-id', 'x-request-id', 'x-idempotency-key'];
const DEFAULT_ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

export function applyCors(req, res) {
  const origin = req.headers.origin ? String(req.headers.origin) : null;
  if (!origin) return { allowed: true, origin: null };

  const configured = parseConfiguredOrigins();
  const allowed = configured.includes(origin);
  if (!allowed) return { allowed: false, origin };

  const allowedHeaders = resolveAllowedHeaders();

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS.join(', '));
  res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', '600');

  return { allowed: true, origin };
}

function parseConfiguredOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (!raw) return [];
  return raw.split(',').map((x) => x.trim()).filter(Boolean);
}

function resolveAllowedHeaders() {
  const raw = String(process.env.CORS_ALLOWED_HEADERS || '').trim();
  if (!raw) return DEFAULT_ALLOWED_HEADERS;
  return raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}
