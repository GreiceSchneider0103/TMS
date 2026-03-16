'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';

const resources = [
  { key: 'companies', label: 'Empresas' },
  { key: 'distribution-centers', label: 'Centros de Distribuição' },
  { key: 'carriers', label: 'Transportadoras' },
  { key: 'carrier-services', label: 'Serviços de Transportadora' },
  { key: 'products', label: 'Produtos' },
  { key: 'recipients', label: 'Destinatários' }
];

export function CrudPanel() {
  const [resource, setResource] = useState(resources[0].key);
  const [payload, setPayload] = useState('{\n\n}');
  const [result, setResult] = useState<any>(null);

  return (
    <div className="grid">
      <PageHeader title="Cadastros" subtitle="Gestão de entidades operacionais" />

      <Panel title="CRUD administrativo">
        <div className="filter-row">
          <select className="select" value={resource} onChange={(e) => setResource(e.target.value)}>
            {resources.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <button className="btn" onClick={async () => setResult(await api(`/${resource}`))}>Listar</button>
          <button className="btn primary" onClick={async () => setResult(await api(`/${resource}`, { method: 'POST', body: payload }))}>Criar</button>
          <StatusBadge status={resource} />
        </div>

        <textarea className="input" rows={11} style={{ width: '100%' }} value={payload} onChange={(e) => setPayload(e.target.value)} />
      </Panel>

      <Panel title="Resultado da operação">
        <pre className="mono" style={{ margin: 0 }}>{JSON.stringify(result, null, 2)}</pre>
      </Panel>
    </div>
  );
}
