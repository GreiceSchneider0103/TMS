'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { JsonView } from '@/components/JsonView';

export function FreightManager() {
  const [out, setOut] = useState<any>(null);
  const [versionId, setVersionId] = useState('');

  async function toBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',').pop() || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return (
    <div className="card">
      <h2>Gestão de tabela de frete</h2>
      <div className="row">
        <input type="file" accept=".xlsx" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const base64Content = await toBase64(file);
          const res = await api('/freight-tables/import', { method: 'POST', body: JSON.stringify({ base64Content }) });
          setOut(res);
          setVersionId(res?.version?.id || '');
        }} />
        <button onClick={async () => setOut(await api(`/freight-tables/versions/${versionId}/publish`, { method: 'POST', body: '{}' }))}>Publicar</button>
        <button onClick={async () => setOut(await api(`/freight-tables/versions/${versionId}/rollback`, { method: 'POST', body: '{}' }))}>Rollback</button>
      </div>
      <JsonView data={out} />
    </div>
  );
}
