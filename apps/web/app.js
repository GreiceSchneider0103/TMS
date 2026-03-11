const app = document.getElementById('app');
const reloadBtn = document.getElementById('reloadBtn');
const apiKeyInput = document.getElementById('apiKey');
let view = 'dashboard';

function headers() {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKeyInput.value,
    'x-correlation-id': crypto.randomUUID()
  };
}

async function api(path, options = {}) {
  const res = await fetch(`http://localhost:3001${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  return res.json();
}

async function render() {
  if (view === 'dashboard') {
    const data = await api('/dashboard/summary');
    app.innerHTML = `<div class="kpis">
      <article><span>Pedidos</span><strong>${data.orders_total || 0}</strong></article>
      <article><span>Aguardando envio</span><strong>${data.pending_dispatch || 0}</strong></article>
      <article><span>Em transporte</span><strong>${data.in_transit || 0}</strong></article>
      <article><span>Entregues</span><strong>${data.delivered || 0}</strong></article>
      <article><span>Atrasados</span><strong>${data.delayed || 0}</strong></article>
      <article><span>Ocorrências</span><strong>${data.exceptions || 0}</strong></article>
    </div>
    <article class="panel"><h2>Por transportadora</h2><pre>${JSON.stringify(data.byCarrier || [], null, 2)}</pre></article>`;
  }

  if (view === 'orders') {
    const data = await api('/orders');
    app.innerHTML = `<article class="panel"><h2>Pedidos</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
  }

  if (view === 'quotes') {
    app.innerHTML = `<article class="panel"><h2>Nova cotação manual</h2><button id="quoteBtn" class="primary">Executar cotação teste</button><pre id="quoteOut"></pre></article>`;
    document.getElementById('quoteBtn').onclick = async () => {
      const payload = { destinationPostalCode: '90010000', state: 'RS', city: 'Porto Alegre', invoiceAmount: 3200, weightKg: 40, lengthCm: 200, widthCm: 90, heightCm: 70, channel: 'tiny', recipientType: 'PF' };
      const result = await api('/quotes/manual', { method: 'POST', body: JSON.stringify(payload) });
      document.getElementById('quoteOut').textContent = JSON.stringify(result, null, 2);
    };
  }

  if (view === 'shipments') {
    const data = await api('/shipments');
    app.innerHTML = `<article class="panel"><h2>Embarques</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
  }

  if (view === 'tracking') {
    const ship = await api('/shipments');
    const id = ship.items?.[0]?.id;
    const data = id ? await api(`/tracking/shipment/${id}`) : { items: [] };
    app.innerHTML = `<article class="panel"><h2>Tracking</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
  }

  if (view === 'cadastros') {
    const [carriers, products, recipients, dcs] = await Promise.all([api('/carriers'), api('/products'), api('/recipients'), api('/distribution-centers')]);
    app.innerHTML = `<article class="panel"><h2>Transportadoras</h2><pre>${JSON.stringify(carriers.items || [], null, 2)}</pre></article>
    <article class="panel"><h2>Produtos</h2><pre>${JSON.stringify(products.items || [], null, 2)}</pre></article>
    <article class="panel"><h2>Destinatários</h2><pre>${JSON.stringify(recipients.items || [], null, 2)}</pre></article>
    <article class="panel"><h2>CDs</h2><pre>${JSON.stringify(dcs.items || [], null, 2)}</pre></article>`;
  }

  if (view === 'freight') {
    app.innerHTML = `<article class="panel"><h2>Tabelas de frete</h2><p>Use endpoint <code>/freight-tables/import</code> para upload base64 e publique via API.</p></article>`;
  }

  if (view === 'integrations') {
    const data = await api('/logs/sync');
    app.innerHTML = `<article class="panel"><h2>Integrações (sync jobs)</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
  }

  if (view === 'audit') {
    const [audit, hooks] = await Promise.all([api('/logs/audit'), api('/logs/webhooks')]);
    app.innerHTML = `<article class="panel"><h2>Audit logs</h2><pre>${JSON.stringify(audit.items || [], null, 2)}</pre></article>
    <article class="panel"><h2>Webhook logs</h2><pre>${JSON.stringify(hooks.items || [], null, 2)}</pre></article>`;
  }
}

document.querySelectorAll('[data-view]').forEach((a) => a.onclick = (e) => { e.preventDefault(); view = a.dataset.view; render(); });
reloadBtn.onclick = render;
render();
