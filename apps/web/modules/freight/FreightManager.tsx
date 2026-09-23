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

const COUNT_LABELS: Record<string, string> = {
  tipo_carga_detectados: 'Tipos de carga',
  rotas_detectadas: 'Rotas',
  taxas_detectadas: 'Taxas por destinatário',
  erros_detectados: 'Erros'
};

export function FreightManager() {
  const [summary, setSummary] = useState<{ counts: Record<string, number>; errors?: string[] } | null>(null);
  const [selectedTable, setSelectedTable] = useState<any>(null);
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
      setSummary({ counts: res?.preview?.counts || {}, errors: res?.errors });
      setVersionId(importedVersionId);
      setMessage(importedVersionId ? `Importação concluída. Versão criada como rascunho — publique para entrar em uso.` : 'Importação encontrou problemas na planilha.');
      setNonce((v) => v + 1);
    } catch (error: any) {
      setMessage(`Falha ao importar a planilha: ${translateError(error?.message)}`);
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
      await api(endpoint, { method: 'POST', body: '{}' });
      setMessage(action === 'publish' ? `Versão ${trimmed} publicada.` : `Rollback da versão ${trimmed} executado.`);
      setNonce((v) => v + 1);
    } catch (error: any) {
      setMessage(`Falha ao ${action === 'publish' ? 'publicar' : 'reverter'} a versão: ${translateError(error?.message)}`);
    } finally {
      setBusy(false);
    }
  }

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
                        <button className="btn ghost" onClick={() => setSelectedTable(r)}>Ver</button>
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

      {summary ? (
        <Panel title="Resumo da importação">
          <div className="filter-row">
            {Object.entries(summary.counts).map(([key, value]) => (
              <StatusBadge key={key} status={`${COUNT_LABELS[key] || key}: ${value}`} />
            ))}
          </div>
          {summary.errors && summary.errors.length > 0 ? (
            <ul>
              {summary.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      {selectedTable ? (
        <Panel title="Detalhes da tabela" right={<button className="btn ghost" onClick={() => setSelectedTable(null)}>Fechar</button>}>
          <div className="grid">
            <div><strong>Nome:</strong> {selectedTable.name || '-'}</div>
            <div><strong>Transportadora:</strong> {selectedTable.carrier_name || '-'}</div>
            <div><strong>Versão:</strong> {selectedTable.version_label || '-'}</div>
            <div><strong>Status:</strong> {selectedTable.status || '-'}</div>
            <div><strong>Publicado em:</strong> {selectedTable.published_at ? new Date(selectedTable.published_at).toLocaleString() : 'Ainda não publicado'}</div>
            <div><strong>Criado em:</strong> {selectedTable.created_at ? new Date(selectedTable.created_at).toLocaleString() : '-'}</div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function translateError(message?: string): string {
  if (!message) return 'erro inesperado';
  const known: Record<string, string> = {
    'Failed to fetch': 'não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
    'Forbidden': 'você não tem permissão para executar esta ação.',
    'Payload too large': 'o arquivo é grande demais para ser enviado.',
    'Unauthorized': 'sua sessão expirou. Faça login novamente.'
  };
  return known[message] || message;
}
