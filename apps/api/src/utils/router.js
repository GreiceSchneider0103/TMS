export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function router() {
  const routes = [];
  const add = (method, path, handler) => routes.push({ method, ...compile(path), handler });

  return {
    get: (path, handler) => add('GET', path, handler),
    post: (path, handler) => add('POST', path, handler),
    patch: (path, handler) => add('PATCH', path, handler),
    delete: (path, handler) => add('DELETE', path, handler),
    async handle(req, res) {
      const url = new URL(req.url, 'http://localhost');
      const route = routes.find((r) => r.method === req.method && r.regex.test(url.pathname));
      if (!route) return false;
      const match = url.pathname.match(route.regex);
      const params = {};
      route.keys.forEach((k, i) => { params[k] = match[i + 1]; });
      const body = await readBody(req);
      try {
        const data = await route.handler({ req, res, body, query: Object.fromEntries(url.searchParams), params });
        if (!res.writableEnded) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(data));
        }
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const message = extractErrorMessage(error);
        const code = error?.code ? String(error.code) : null;

        if (status >= 500 || !error?.status) {
          console.error(JSON.stringify({
            ts: new Date().toISOString(),
            event: 'api_route_error',
            method: req.method,
            path: url.pathname,
            message,
            code,
            detail: error?.detail || null,
            hint: error?.hint || null,
            stack: error?.stack || null
          }));
        }

        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: message, ...(code ? { code } : {}) }));
      }
      return true;
    }
  };
}

function compile(path) {
  const keys = [];
  const pattern = path.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${pattern}$`), keys };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function extractErrorMessage(error) {
  if (!error) return 'Unexpected error';
  if (typeof error === 'string' && error.trim()) return error;

  const candidates = [
    error.message,
    error.detail,
    error.hint,
    error.reason,
    error.cause?.message
  ];

  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item;
  }

  return 'Unexpected error';
}
