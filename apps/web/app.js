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
  const payload = await res.json();
  if (!res.ok || payload?.error) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload;
}

function notice(message, type = 'ok') {
  return `<p class="notice ${type}">${message}</p>`;
}

async function render() {
  try {
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
      return;
    }

    if (view === 'orders') {
      const data = await api('/orders');
      app.innerHTML = `<article class="panel"><h2>Pedidos</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
      return;
    }

    if (view === 'quotes') {
      app.innerHTML = `<article class="panel"><h2>Nova cotação manual</h2>
        <form id="quoteForm" class="grid2">
          <input name="destinationPostalCode" placeholder="CEP destino" value="90010000" required />
          <input name="state" placeholder="UF" value="RS" required />
          <input name="city" placeholder="Cidade" value="Porto Alegre" required />
          <input name="invoiceAmount" type="number" placeholder="Valor NF" value="3200" required />
          <input name="weightKg" type="number" step="0.001" placeholder="Peso kg" value="40" required />
          <input name="lengthCm" type="number" placeholder="Comprimento cm" value="200" required />
          <input name="widthCm" type="number" placeholder="Largura cm" value="90" required />
          <input name="heightCm" type="number" placeholder="Altura cm" value="70" required />
          <button class="primary" type="submit">Calcular</button>
        </form>
        <pre id="quoteOut"></pre></article>`;
      document.getElementById('quoteForm').onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = Object.fromEntries(f.entries());
        payload.invoiceAmount = Number(payload.invoiceAmount);
        payload.weightKg = Number(payload.weightKg);
        payload.lengthCm = Number(payload.lengthCm);
        payload.widthCm = Number(payload.widthCm);
        payload.heightCm = Number(payload.heightCm);
        payload.channel = 'tiny';
        payload.recipientType = 'PF';
        const result = await api('/quotes/manual', { method: 'POST', body: JSON.stringify(payload) });
        document.getElementById('quoteOut').textContent = JSON.stringify(result, null, 2);
      };
      return;
    }

    if (view === 'shipments') {
      const data = await api('/shipments');
      app.innerHTML = `<article class="panel"><h2>Embarques</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
      return;
    }

    if (view === 'tracking') {
      const ship = await api('/shipments');
      app.innerHTML = `<article class="panel"><h2>Tracking</h2>
        <form id="trackForm" class="grid2"><input id="shipmentId" placeholder="Shipment ID" value="${ship.items?.[0]?.id || ''}"/><button class="primary" type="submit">Buscar timeline</button></form>
        <pre id="trackOut"></pre></article>`;
      document.getElementById('trackForm').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('shipmentId').value;
        const data = await api(`/tracking/shipment/${id}`);
        document.getElementById('trackOut').textContent = JSON.stringify(data.items || [], null, 2);
      };
      return;
    }

    if (view === 'cadastros') {
      const [carriers, products, recipients, dcs] = await Promise.all([api('/carriers'), api('/products'), api('/recipients'), api('/distribution-centers')]);
      app.innerHTML = `<article class="panel"><h2>Criar destinatário</h2>
        <form id="recipientForm" class="grid2">
          <input name="document" placeholder="Documento" required/>
          <input name="legalName" placeholder="Nome/Razão" required/>
          <input name="type" placeholder="PF/PJ" value="PF" required/>
          <input name="postalCode" placeholder="CEP" required/>
          <input name="city" placeholder="Cidade" required/>
          <input name="state" placeholder="UF" required/>
          <input name="addressLine" placeholder="Endereço" required/>
          <button class="primary" type="submit">Salvar destinatário</button>
        </form>
        <div id="recipientMsg"></div>
      </article>
      <article class="panel"><h2>Transportadoras</h2><pre>${JSON.stringify(carriers.items || [], null, 2)}</pre></article>
      <article class="panel"><h2>Produtos</h2><pre>${JSON.stringify(products.items || [], null, 2)}</pre></article>
      <article class="panel"><h2>Destinatários</h2><pre>${JSON.stringify(recipients.items || [], null, 2)}</pre></article>
      <article class="panel"><h2>CDs</h2><pre>${JSON.stringify(dcs.items || [], null, 2)}</pre></article>`;
      document.getElementById('recipientForm').onsubmit = async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.target).entries());
        try {
          await api('/recipients', { method: 'POST', body: JSON.stringify(body) });
          document.getElementById('recipientMsg').innerHTML = notice('Destinatário criado com sucesso');
        } catch (err) {
          document.getElementById('recipientMsg').innerHTML = notice(err.message, 'err');
        }
      };
      return;
    }

    if (view === 'freight') {
      app.innerHTML = `<article class="panel"><h2>Tabelas de frete</h2>
        <form id="freightForm" class="grid2">
          <input name="tableName" placeholder="Nome da tabela" required />
          <input name="versionLabel" placeholder="Versão" value="v1" required />
          <input id="xlsx" type="file" accept=".xlsx" required />
          <button class="primary" type="submit">Importar</button>
        </form>
        <div id="freightMsg"></div>
        <pre id="freightOut"></pre>
      </article>`;
      document.getElementById('freightForm').onsubmit = async (e) => {
        e.preventDefault();
        const file = document.getElementById('xlsx').files[0];
        const b64 = await fileToBase64(file);
        const data = await api('/freight-tables/import', {
          method: 'POST',
          body: JSON.stringify({ tableName: e.target.tableName.value, versionLabel: e.target.versionLabel.value, fileName: file.name, fileBase64: b64 })
        });
        document.getElementById('freightMsg').innerHTML = notice(data.ok ? 'Import concluído' : 'Import com erros', data.ok ? 'ok' : 'err');
        document.getElementById('freightOut').textContent = JSON.stringify(data, null, 2);
      };
      return;
    }

    if (view === 'integrations') {
      const data = await api('/logs/sync');
      app.innerHTML = `<article class="panel"><h2>Integrações (sync jobs)</h2><pre>${JSON.stringify(data.items || [], null, 2)}</pre></article>`;
      return;
    }

    if (view === 'audit') {
      const [audit, hooks] = await Promise.all([api('/logs/audit'), api('/logs/webhooks')]);
      app.innerHTML = `<article class="panel"><h2>Audit logs</h2><pre>${JSON.stringify(audit.items || [], null, 2)}</pre></article>
      <article class="panel"><h2>Webhook logs</h2><pre>${JSON.stringify(hooks.items || [], null, 2)}</pre></article>`;
    }
  } catch (error) {
    app.innerHTML = `<article class="panel">${notice(error.message, 'err')}</article>`;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop());
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.querySelectorAll('[data-view]').forEach((a) => a.onclick = (e) => { e.preventDefault(); view = a.dataset.view; render(); });
reloadBtn.onclick = render;
render();
