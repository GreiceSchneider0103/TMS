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

function q(params = {}) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return s.toString() ? `?${s.toString()}` : '';
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
      app.innerHTML = `<article class="panel"><h2>Pedidos</h2><form id="ordersFilter" class="grid2"><input name="limit" placeholder="limit" value="50"/><input name="offset" placeholder="offset" value="0"/><button class="primary">Filtrar</button></form><pre id="ordersOut"></pre></article>`;
      document.getElementById('ordersFilter').onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target).entries());
        const data = await api(`/orders${q(f)}`);
        document.getElementById('ordersOut').textContent = JSON.stringify(data.items || [], null, 2);
      };
      document.getElementById('ordersFilter').dispatchEvent(new Event('submit'));
      return;
    }

    if (view === 'quotes') {
      app.innerHTML = `<article class="panel"><h2>Nova cotação manual</h2>
        <form id="quoteForm" class="grid2">
          <input name="destinationPostalCode" placeholder="CEP destino" required />
          <input name="state" placeholder="UF" required />
          <input name="city" placeholder="Cidade" required />
          <input name="invoiceAmount" type="number" placeholder="Valor NF" required />
          <input name="weightKg" type="number" step="0.001" placeholder="Peso kg" required />
          <input name="lengthCm" type="number" placeholder="Comprimento cm" required />
          <input name="widthCm" type="number" placeholder="Largura cm" required />
          <input name="heightCm" type="number" placeholder="Altura cm" required />
          <button class="primary" type="submit">Calcular</button>
        </form>
        <pre id="quoteOut"></pre></article>`;
      document.getElementById('quoteForm').onsubmit = async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.target).entries());
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
      app.innerHTML = `<article class="panel"><h2>Embarques</h2><button id="loadShipments" class="primary">Carregar</button><pre id="shipmentsOut"></pre></article>`;
      document.getElementById('loadShipments').onclick = async () => {
        const data = await api('/shipments');
        document.getElementById('shipmentsOut').textContent = JSON.stringify(data.items || [], null, 2);
      };
      document.getElementById('loadShipments').click();
      return;
    }

    if (view === 'tracking') {
      const ships = await api('/shipments');
      app.innerHTML = `<article class="panel"><h2>Tracking</h2>
        <form id="trackForm" class="grid2">
          <input id="shipmentId" placeholder="Shipment ID" value="${ships.items?.[0]?.id || ''}"/>
          <button class="primary" type="submit">Buscar timeline</button>
        </form>
        <pre id="trackOut"></pre>
      </article>
      <article class="panel"><h2>Embarques disponíveis</h2><pre>${JSON.stringify((ships.items || []).map((s) => ({ id: s.id, status: s.status, tracking_code: s.tracking_code })), null, 2)}</pre></article>`;
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
      app.innerHTML = `
      <article class="panel"><h2>Carriers (create/update/delete lógico)</h2>
        <form id="carrierCreate" class="grid2"><input name="name" placeholder="Nome" required/><input name="externalName" placeholder="Nome externo"/><button class="primary">Criar carrier</button></form>
        <form id="carrierEdit" class="grid2"><input name="id" placeholder="ID" required/><input name="name" placeholder="Novo nome" required/><button>Editar carrier</button></form>
        <form id="carrierDelete" class="grid2"><input name="id" placeholder="ID" required/><button>Excluir carrier</button></form>
      </article>

      <article class="panel"><h2>Products (create/update/delete lógico)</h2>
        <form id="productCreate" class="grid2"><input name="skuInternal" placeholder="SKU" required/><input name="name" placeholder="Nome" required/><button class="primary">Criar product</button></form>
        <form id="productEdit" class="grid2"><input name="id" placeholder="ID" required/><input name="name" placeholder="Novo nome" required/><button>Editar product</button></form>
        <form id="productDelete" class="grid2"><input name="id" placeholder="ID" required/><button>Excluir product</button></form>
      </article>

      <article class="panel"><h2>Recipients (create/update/delete lógico)</h2>
        <form id="recipientCreate" class="grid2"><input name="document" placeholder="Documento" required/><input name="legalName" placeholder="Nome" required/><input name="type" value="PF" required/><input name="postalCode" placeholder="CEP" required/><input name="city" placeholder="Cidade" required/><input name="state" placeholder="UF" required/><input name="addressLine" placeholder="Endereço" required/><button class="primary">Criar recipient</button></form>
        <form id="recipientEdit" class="grid2"><input name="id" placeholder="ID" required/><input name="legalName" placeholder="Novo nome" required/><button>Editar recipient</button></form>
        <form id="recipientDelete" class="grid2"><input name="id" placeholder="ID" required/><button>Excluir recipient</button></form>
      </article>

      <article class="panel"><h2>Distribution Centers (create/update/delete lógico)</h2>
        <form id="dcCreate" class="grid2"><input name="companyId" placeholder="Company ID" required/><input name="name" placeholder="Nome" required/><input name="postalCode" placeholder="CEP" required/><input name="city" placeholder="Cidade" required/><input name="state" placeholder="UF" required/><input name="addressLine" placeholder="Endereço" required/><button class="primary">Criar CD</button></form>
        <form id="dcEdit" class="grid2"><input name="id" placeholder="ID" required/><input name="name" placeholder="Novo nome" required/><button>Editar CD</button></form>
        <form id="dcDelete" class="grid2"><input name="id" placeholder="ID" required/><button>Excluir CD</button></form>
      </article>

      <article class="panel"><h2>Snapshot cadastros</h2><pre>${JSON.stringify({ carriers: carriers.items, products: products.items, recipients: recipients.items, distributionCenters: dcs.items }, null, 2)}</pre></article>
      <div id="cadastroMsg"></div>`;

      bindCrudForm('carrierCreate', '/carriers', 'POST');
      bindCrudForm('carrierEdit', ({ id, ...rest }) => [`/carriers/${id}`, { ...rest }], 'PATCH');
      bindCrudForm('carrierDelete', ({ id }) => [`/carriers/${id}`, {}], 'DELETE');

      bindCrudForm('productCreate', '/products', 'POST');
      bindCrudForm('productEdit', ({ id, ...rest }) => [`/products/${id}`, rest], 'PATCH');
      bindCrudForm('productDelete', ({ id }) => [`/products/${id}`, {}], 'DELETE');

      bindCrudForm('recipientCreate', '/recipients', 'POST');
      bindCrudForm('recipientEdit', ({ id, ...rest }) => [`/recipients/${id}`, rest], 'PATCH');
      bindCrudForm('recipientDelete', ({ id }) => [`/recipients/${id}`, {}], 'DELETE');

      bindCrudForm('dcCreate', ({ companyId, name, postalCode, city, state, addressLine }) => ['/distribution-centers', { companyId, name, postalCode, city, state, addressLine }], 'POST');
      bindCrudForm('dcEdit', ({ id, ...rest }) => [`/distribution-centers/${id}`, rest], 'PATCH');
      bindCrudForm('dcDelete', ({ id }) => [`/distribution-centers/${id}`, {}], 'DELETE');
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
        <form id="freightActions" class="grid2">
          <input name="versionId" placeholder="Version ID" required />
          <button name="publish" value="1" type="submit">Publish</button>
          <button name="rollback" value="1" type="submit">Rollback</button>
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
        document.getElementById('freightOut').textContent = JSON.stringify({ preview: data.preview, errors: data.errors || [], versionId: data.version?.id }, null, 2);
      };

      document.getElementById('freightActions').onsubmit = async (e) => {
        e.preventDefault();
        const versionId = e.target.versionId.value;
        const action = e.submitter?.name;
        const path = action === 'publish' ? `/freight-tables/versions/${versionId}/publish` : `/freight-tables/versions/${versionId}/rollback`;
        const data = await api(path, { method: 'POST', body: JSON.stringify({}) });
        document.getElementById('freightMsg').innerHTML = notice(`${action} executado`);
        document.getElementById('freightOut').textContent = JSON.stringify(data, null, 2);
      };
      return;
    }

    if (view === 'integrations') {
      app.innerHTML = `<article class="panel"><h2>Integrações (sync jobs)</h2>
      <form id="syncFilters" class="grid2"><input name="from" type="date"/><input name="to" type="date"/><input name="status" placeholder="status"/><input name="correlation_id" placeholder="correlation_id"/><button class="primary">Filtrar</button></form>
      <pre id="syncOut"></pre></article>`;
      document.getElementById('syncFilters').onsubmit = async (e) => {
        e.preventDefault();
        const filters = Object.fromEntries(new FormData(e.target).entries());
        const data = await api(`/logs/sync${q(filters)}`);
        document.getElementById('syncOut').textContent = JSON.stringify(data.items || [], null, 2);
      };
      document.getElementById('syncFilters').dispatchEvent(new Event('submit'));
      return;
    }

    if (view === 'audit') {
      app.innerHTML = `<article class="panel"><h2>Audit/Webhook logs</h2>
        <form id="auditFilters" class="grid2">
          <input name="from" type="date"/>
          <input name="to" type="date"/>
          <input name="status" placeholder="status webhook"/>
          <input name="entity_id" placeholder="entity_id"/>
          <input name="correlation_id" placeholder="correlation_id"/>
          <button class="primary">Filtrar</button>
        </form>
        <h3>Audit</h3><pre id="auditOut"></pre>
        <h3>Webhooks</h3><pre id="hookOut"></pre>
      </article>`;
      document.getElementById('auditFilters').onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target).entries());
        const [audit, hooks] = await Promise.all([
          api(`/logs/audit${q({ from: f.from, to: f.to, entity_id: f.entity_id, correlation_id: f.correlation_id })}`),
          api(`/logs/webhooks${q({ from: f.from, to: f.to, status: f.status, correlation_id: f.correlation_id })}`)
        ]);
        document.getElementById('auditOut').textContent = JSON.stringify(audit.items || [], null, 2);
        document.getElementById('hookOut').textContent = JSON.stringify(hooks.items || [], null, 2);
      };
      document.getElementById('auditFilters').dispatchEvent(new Event('submit'));
      return;
    }
  } catch (error) {
    app.innerHTML = `<article class="panel">${notice(error.message, 'err')}</article>`;
  }
}

function bindCrudForm(formId, pathOrBuilder, method) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (method === 'DELETE' && !window.confirm('Confirma exclusão lógica?')) return;
    const raw = Object.fromEntries(new FormData(e.target).entries());
    const [path, body] = typeof pathOrBuilder === 'function' ? pathOrBuilder(raw) : [pathOrBuilder, raw];
    try {
      await api(path, { method, body: method === 'DELETE' ? JSON.stringify({}) : JSON.stringify(body) });
      document.getElementById('cadastroMsg').innerHTML = notice(`Operação ${method} concluída`);
      await render();
    } catch (err) {
      document.getElementById('cadastroMsg').innerHTML = notice(err.message, 'err');
    }
  };
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
