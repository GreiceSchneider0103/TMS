'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';

const mockRows = [
  { name: 'Tabela Correios 2026', carrier: 'Correios', version: 'v3.2', status: 'Publicada', date: '01/03/2026' },
  { name: 'Tabela Jadlog Q1', carrier: 'Jadlog', version: 'v2.1', status: 'Publicada', date: '28/02/2026' },
  { name: 'Total Express Standard', carrier: 'Total Express', version: 'v1.8', status: 'Publicada', date: '25/02/2026' },
  { name: 'Azul Cargo Premium', carrier: 'Azul Cargo', version: 'v2.0', status: 'Rascunho', date: '15/03/2026' }
];

export function FreightManager() {
  const [out, setOut] = useState<any>(null);
  const [versionId, setVersionId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function toBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',').pop() || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function importWorkbook(file: File) {
    setBusy(true);
    setMessage('Importando planilha...');
    try {
      const base64Content = await toBase64(file);
      const res = await api('/freight-tables/import', { method: 'POST', body: JSON.stringify({ base64Content }) });
      const importedVersionId = res?.version?.id ? String(res.version.id) : '';
      setOut(res);
      setVersionId(importedVersionId);
      setMessage(importedVersionId ? `Import concluído. Versão ${importedVersionId}` : 'Import concluído sem versionId retornado.');
    } catch (error: any) {
      setMessage(`Falha no import: ${error?.message || 'erro inesperado'}`);
    } finally {
      setBusy(false);
    }
  }

  async function runVersionAction(action: 'publish' | 'rollback') {
    const trimmed = versionId.trim();
    if (!trimmed) return setMessage('Informe versionId para executar a ação.');

    setBusy(true);
    try {
      const endpoint = action === 'publish' ? `/freight-tables/versions/${trimmed}/publish` : `/freight-tables/versions/${trimmed}/rollback`;
      const res = await api(endpoint, { method: 'POST', body: '{}' });
      setOut(res);
      setMessage(action === 'publish' ? `Versão ${trimmed} publicada.` : `Rollback da versão ${trimmed} executado.`);
    } catch (error: any) {
      setMessage(`Falha: ${error?.message || 'erro inesperado'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <PageHeader title="Tabelas de Frete" subtitle="Gerenciar tabelas de preços e prazos" actions={<label className="btn primary" style={{ display: 'inline-flex' }}>Importar Planilha<input hidden type="file" accept=".xlsx" disabled={busy} onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await importWorkbook(file);
      }} /></label>} />

      <Panel title="Ações de versão">
        <div className="filter-row">
          <input className="input" placeholder="versionId" value={versionId} disabled={busy} onChange={(e) => setVersionId(e.target.value)} />
          <button className="btn primary" disabled={busy || !versionId.trim()} onClick={() => runVersionAction('publish')}>Publicar</button>
          <button className="btn" disabled={busy || !versionId.trim()} onClick={() => runVersionAction('rollback')}>Rollback</button>
          {message ? <span style={{ color: '#9fafd4' }}>{message}</span> : null}
        </div>
      </Panel>

      <Panel title="Tabelas Cadastradas">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Transportadora</th><th>Versão</th><th>Status</th><th>Data Upload</th><th>Ações</th></tr></thead>
            <tbody>
              {mockRows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td><td>{r.carrier}</td><td>{r.version}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.date}</td>
                  <td><div className="row-actions"><button className="btn ghost">Ver</button><button className="btn">Rollback</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {out ? <Panel title="Resposta técnica"><pre className="mono" style={{ margin: 0 }}>{JSON.stringify(out, null, 2)}</pre></Panel> : null}
    </div>
  );
}
