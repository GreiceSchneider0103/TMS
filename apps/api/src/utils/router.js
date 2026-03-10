export function router() {
  const routes = [];
  return {
    get(path, handler) { routes.push({ method: 'GET', path, handler }); },
    post(path, handler) { routes.push({ method: 'POST', path, handler }); },
    async handle(req, res) {
      const url = new URL(req.url, 'http://localhost');
      const route = routes.find((r) => r.method === req.method && r.path === url.pathname);
      if (!route) return false;
      const body = await readBody(req);
      const data = await route.handler({ req, res, body, query: Object.fromEntries(url.searchParams) });
      if (res.writableEnded) return true;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    }
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}
