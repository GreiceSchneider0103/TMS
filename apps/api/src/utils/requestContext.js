import crypto from 'node:crypto';

export function attachRequestContext(req, res) {
  const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
  const correlationId = String(req.headers['x-correlation-id'] || requestId);
  req.requestContext = { requestId, correlationId };
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);
  return req.requestContext;
}

export function logRequest(req, statusCode, extra = {}) {
  const ctx = req.requestContext || {};
  const accountId = req.tmsContext?.accountId || null;
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event: 'api_request',
    method: req.method,
    path: new URL(req.url, 'http://localhost').pathname,
    statusCode,
    requestId: ctx.requestId || null,
    correlationId: ctx.correlationId || null,
    accountId,
    ...extra
  }));
}
