const app = document.getElementById('app');
const reloadBtn = document.getElementById('reloadBtn');
const accountInput = document.getElementById('accountId');
let view = 'dashboard';

function headers() {
  return { 'content-type': 'application/json', 'x-account-id': accountInput.value };
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
      <article><span>Pendente cotação</span><strong>${data.pending_quote || 0}</strong></article>
      <article><span>Cotados</span><strong>${data.quoted || 0}</strong></article>
      <article><span>Em trânsito</span><strong>${data.in_transit || 0}</strong></article>
      <article><span>Entregues</span><strong>${data.delivered || 0}</strong></article>
      <article><span>Ocorrências</span><strong>${data.exceptions || 0}</strong></article>
    </div>
    <article class="panel"><h2>Performance por transportadora</h2><pre>${JSON.stringify(data.byCarrier || [], null, 2)}</pre></article>`;
  }

  if (view === 'orders') {
    const data = await api('/orders');
    app.innerHTML = `<article class="panel"><h2>Pedidos</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
  }

  if (view === 'quotes') {
    app.innerHTML = `<article class="panel"><h2>Cotação manual</h2>
      <button id="quoteBtn" class="primary">Executar cotação teste</button>
      <pre id="quoteOut"></pre>
    </article>`;
    document.getElementById('quoteBtn').onclick = async () => {
      const payload = {
        destinationPostalCode: '90010000',
        state: 'RS',
        city: 'Porto Alegre',
        invoiceAmount: 3200,
        weightKg: 40,
        lengthCm: 200,
        widthCm: 90,
        heightCm: 70,
        channel: 'tiny',
        recipientType: 'PF'
      };
      const result = await api('/quotes/manual', { method: 'POST', body: JSON.stringify(payload) });
      document.getElementById('quoteOut').textContent = JSON.stringify(result, null, 2);
    };
  }

  if (view === 'shipments') {
    const data = await api('/shipments');
    app.innerHTML = `<article class="panel"><h2>Embarques</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
  }
}

document.querySelectorAll('[data-view]').forEach((a) => a.onclick = (e) => { e.preventDefault(); view = a.dataset.view; render(); });
reloadBtn.onclick = render;
render();
