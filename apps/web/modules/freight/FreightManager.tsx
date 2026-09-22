'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';

export function FreightManager() {
  const [out, setOut] = useState<any>(null);
  const [versionId, setVersionId] = useState('');
  const [tableName, setTableName] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const tables = useApi(() => api('/freight-tables'), [nonce]);
  const tableRows = (tables.data as any)?.items || [];

  async function toBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',').pop() || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function importWorkbook(file: File) {
    if (!tableName.trim()) return setMessage('Informe o nome da tabela antes de importar.');
    setBusy(true);
    setMessage('Importando planilha...');
    try {
      const fileBase64 = await toBase64(file);
      const res = await api('/freight-tables/import', {
        method: 'POST',
        body: JSON.stringify({
          fileBase64,
          fileName: file.name,
          mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          byteSize: file.size,
          tableName: tableName.trim(),
          carrierId: carrierId.trim() || null
        })
      });
      const importedVersionId = res?.version?.id ? String(res.version.id) : '';
      setOut(res);
      setVersionId(importedVersionId);
      setMessage(importedVersionId ? `Import concluído. Versão ${importedVersionId}` : 'Import concluído sem versionId retornado.');
      setNonce((v) => v + 1);
    } catch (error: any) {
      setMessage(`Falha no import: ${error?.message || 'erro inesperado'}`);
    } finally {
      setBusy(false);
    }
  }

  async function runVersionAction(action: 'publish' | 'rollback', targetVersionId?: string) {
    const trimmed = (targetVersionId || versionId).trim();
    if (!trimmed) return setMessage('Informe versionId para executar a ação.');

    setBusy(true);
    try {
      const endpoint = action === 'publish' ? `/freight-tables/versions/${trimmed}/publish` : `/freight-tables/versions/${trimmed}/rollback`;
      const res = await api(endpoint, { method: 'POST', body: '{}' });
      setOut(res);
      setMessage(action === 'publish' ? `Versão ${trimmed} publicada.` : `Rollback da versão ${trimmed} executado.`);
      setNonce((v) => v + 1);
    } catch (error: any) {
      setMessage(`Falha: ${error?.message || 'erro inesperado'}`);
    } finally {
      setBusy(false);
    }
  }

  const previewRows = out?.preview?.rows || out?.version?.stats || null;

  return (
    <div className="grid">
      <PageHeader title="Tabelas de Frete" subtitle="Gerenciar tabelas de preços e prazos" />

      <Panel title="Importar planilha">
        <div className="filter-row">
          <input className="input" placeholder="Nome da tabela (obrigatório)" value={tableName} disabled={busy} onChange={(e) => setTableName(e.target.value)} />
          <input className="input" placeholder="ID da transportadora (opcional)" value={carrierId} disabled={busy} onChange={(e) => setCarrierId(e.target.value)} />
          <label className="btn primary" style={{ display: 'inline-flex' }}>Importar Planilha<input hidden type="file" accept=".xlsx" disabled={busy} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await importWorkbook(file);
          }} /></label>
        </div>
      </Panel>

      <Panel title="Ações de versão">
        <div className="filter-row">
          <input className="input" placeholder="versionId" value={versionId} disabled={busy} onChange={(e) => setVersionId(e.target.value)} />
          <button className="btn primary" disabled={busy || !versionId.trim()} onClick={() => runVersionAction('publish')}>Publicar</button>
          <button className="btn" disabled={busy || !versionId.trim()} onClick={() => runVersionAction('rollback')}>Rollback</button>
          {busy ? <LoadingState text="Processando operação..." /> : null}
        </div>
        {message ? <div className="empty-state">{message}</div> : null}
      </Panel>

      <Panel title="Tabelas Cadastradas" right={<button className="btn" onClick={() => setNonce((v) => v + 1)}>Atualizar</button>}>
        {tables.loading ? <LoadingState text="Carregando tabelas..." /> : tables.error ? <ErrorState text={tables.error} /> : tableRows.length === 0 ? <EmptyState /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>Transportadora</th><th>Versão</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
              <tbody>
                {tableRows.map((r: any) => (
                  <tr key={r.table_id}>
                    <td>{r.name}</td><td>{r.carrier_name || '-'}</td><td>{r.version_label || '-'}</td>
                    <td><StatusBadge status={r.status || 'DRAFT'} /></td>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost" onClick={() => setOut(r)}>Ver</button>
                        {r.status === 'DRAFT' ? (
                          <button className="btn primary" disabled={busy || !r.version_id} onClick={() => runVersionAction('publish', r.version_id)}>Publicar</button>
                        ) : (
                          <button className="btn" disabled={busy || !r.version_id} onClick={() => runVersionAction('rollback', r.version_id)}>Rollback</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {previewRows ? <Panel title="Preview da importação"><pre className="mono" style={{ margin: 0 }}>{JSON.stringify(previewRows, null, 2)}</pre></Panel> : null}
      {out ? <Panel title="Resposta técnica"><pre className="mono" style={{ margin: 0 }}>{JSON.stringify(out, null, 2)}</pre></Panel> : null}
    </div>
  );
}
