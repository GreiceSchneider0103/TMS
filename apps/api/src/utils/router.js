export function router() {
  const routes = [];
  const add = (method, path, handler) => routes.push({ method, ...compile(path), handler });

  return {
    get: (path, handler) => add('GET', path, handler),
    post: (path, handler) => add('POST', path, handler),
    patch: (path, handler) => add('PATCH', path, handler),
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
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
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
  return text ? JSON.parse(text) : {};
}
