'use client';
import { useRef, useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { formatDate, formatDateTime, formatNumber } from '@/services/format';

const COUNT_LABELS: Record<string, string> = {
  tipo_carga_detectados: 'Tipos de carga',
  rotas_detectadas: 'Rotas',
  taxas_detectadas: 'Taxas por destinatário',
  erros_detectados: 'Erros'
};

// Versões importadas recebem rótulo automático "v-<timestamp>"; exibimos a data em vez do número.
function versionLabel(label?: string, createdAt?: string) {
  if (!label) return '-';
  return /^v-\d{10,}$/.test(label) ? `Importada em ${formatDate(createdAt || Number(label.slice(2)))}` : label;
}

export function FreightManager() {
  const [summary, setSummary] = useState<{ counts: Record<string, number>; errors?: string[] } | null>(null);
  const [tableName, setTableName] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const tables = useApi(() => api('/freight-tables'), []);
  const carriers = useApi(() => api('/carriers'), []);
  const tableRows: any[] = (tables.data as any)?.items || [];

  async function toBase64(f: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',').pop() || '');
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function importWorkbook() {
    if (!tableName.trim()) return setFeedback({ ok: false, text: 'Informe o nome da tabela antes de importar.' });
    if (!file) return setFeedback({ ok: false, text: 'Escolha a planilha (.xlsx) a importar.' });
    setBusy(true);
    setFeedback({ ok: true, text: 'Importando planilha, isso pode levar alguns segundos...' });
    setSummary(null);
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
          carrierId: carrierId || null
        })
      });
      setSummary({ counts: res?.preview?.counts || {}, errors: res?.errors });
      if (res?.version?.id) {
        setFeedback({ ok: true, text: 'Planilha importada como rascunho. Confira o resumo e clique em “Publicar” para que ela passe a ser usada nas cotações.' });
        setTableName('');
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
      } else {
        setFeedback({ ok: false, text: 'A planilha tem problemas e não foi importada. Veja os erros abaixo.' });
      }
      tables.reload();
    } catch (error: any) {
      setFeedback({ ok: false, text: `Falha ao importar a planilha: ${error.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function runVersionAction(action: 'publish' | 'rollback', row: any) {
    const question = action === 'publish'
      ? `Publicar a tabela "${row.name}"? Ela passa a ser usada nas cotações.`
      : `Reverter a tabela "${row.name}" para a versão anterior?`;
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      await api(`/freight-tables/versions/${row.version_id}/${action}`, { method: 'POST', body: '{}' });
      setFeedback({ ok: true, text: action === 'publish' ? `Tabela "${row.name}" publicada.` : `Tabela "${row.name}" revertida para a versão anterior.` });
      tables.reload();
    } catch (error: any) {
      setFeedback({ ok: false, text: `Falha ao ${action === 'publish' ? 'publicar' : 'reverter'} a tabela: ${error.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <PageHeader title="Tabelas de frete" subtitle="Tabelas de preço e prazo das transportadoras usadas nas cotações" />

      <Panel title="Importar planilha" subtitle="Envie a tabela da transportadora no formato .xlsx">
        <div className="filter-row">
          <Field label="Nome da tabela" required className="grow">
            <input className="input" placeholder="Ex.: RodoBrasil Sul 2026" value={tableName} disabled={busy} onChange={(e) => setTableName(e.target.value)} />
          </Field>
          <Field label="Transportadora">
            <select className="select" value={carrierId} disabled={busy} onChange={(e) => setCarrierId(e.target.value)}>
              <option value="">Não vincular</option>
              {((carriers.data as any)?.items || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Planilha" required className="grow">
            <input ref={fileInput} className="input" type="file" accept=".xlsx" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </Field>
          <button className="btn primary" disabled={busy || !file || !tableName.trim()} onClick={importWorkbook}>{busy ? 'Importando...' : 'Importar'}</button>
        </div>
      </Panel>

      {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

      {summary ? (
        <Panel title="Resumo da importação" right={<button className="btn ghost sm" onClick={() => setSummary(null)}>Fechar</button>}>
          <div className="chips">
            {Object.entries(summary.counts).map(([key, value]) => (
              <span key={key} className={`badge ${key === 'erros_detectados' && Number(value) > 0 ? 'error' : 'info'}`}>{COUNT_LABELS[key] || key}: {formatNumber(value)}</span>
            ))}
          </div>
          {summary.errors && summary.errors.length > 0 ? (
            <ul className="text-error" style={{ margin: '12px 0 0', paddingLeft: 18 }}>
              {summary.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Tabelas cadastradas" subtitle={tables.loading ? undefined : `${tableRows.length} tabela(s)`} right={<button className="btn sm" onClick={tables.reload}><Icon name="refresh" />Atualizar</button>}>
        {tables.loading ? <LoadingState text="Carregando tabelas..." /> : tables.error ? <ErrorState text={tables.error} /> : tableRows.length === 0 ? <EmptyState text="Nenhuma tabela importada ainda." /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr><th>Nome</th><th>Transportadora</th><th>Versão</th><th>Situação</th><th>Publicada em</th><th></th></tr></thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.table_id}>
                    <td className="cell-title">{r.name}</td>
                    <td data-label="Transportadora">{r.carrier_name || '-'}</td>
                    <td data-label="Versão">{versionLabel(r.version_label, r.created_at)}</td>
                    <td data-label="Situação"><StatusBadge status={r.status || 'DRAFT'} /></td>
                    <td data-label="Publicada em" className="nowrap">{r.published_at ? formatDateTime(r.published_at) : '-'}</td>
                    <td data-label="" className="text-right">
                      <div className="row-actions">
                        {r.status === 'DRAFT' ? (
                          <button className="btn primary sm" disabled={busy || !r.version_id} onClick={() => runVersionAction('publish', r)}>Publicar</button>
                        ) : r.status === 'PUBLISHED' ? (
                          <button className="btn sm" disabled={busy || !r.version_id} onClick={() => runVersionAction('rollback', r)}>Reverter</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
