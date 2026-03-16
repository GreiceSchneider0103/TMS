'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { JsonView } from '@/components/JsonView';

const resources = [
  'companies',
  'distribution-centers',
  'carriers',
  'carrier-services',
  'products',
  'recipients'
];

export function CrudPanel() {
  const [resource, setResource] = useState(resources[0]);
  const [payload, setPayload] = useState('{\n\n}');
  const [result, setResult] = useState<any>(null);

  return (
    <div className="card">
      <h2>Cadastros operacionais</h2>
      <div className="row">
        <select value={resource} onChange={(e) => setResource(e.target.value)}>{resources.map((r) => <option key={r}>{r}</option>)}</select>
        <button onClick={async () => setResult(await api(`/${resource}`))}>Listar</button>
        <button onClick={async () => setResult(await api(`/${resource}`, { method: 'POST', body: payload }))}>Criar</button>
      </div>
      <textarea rows={10} style={{ width: '100%' }} value={payload} onChange={(e) => setPayload(e.target.value)} />
      <JsonView data={result} />
    </div>
  );
}
