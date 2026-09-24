'use client';
import { useRef, useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Icon } from '@/components/ui/Icon';
import { downloadBase64, readFileBase64 } from '@/services/files';
import { formatDateTime } from '@/services/format';

// Importação de produtos por planilha (.xlsx ou .csv), com modelo e histórico.
export function ProductImport({ onImported }: { onImported: () => void }) {
  const history = useApi(() => api('/imports?kind=produtos'), []);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const jobs: any[] = (history.data as any)?.items || [];

  async function downloadTemplate() {
    try {
      const res = await api('/products/import-template');
      downloadBase64(res.fileName, res.mimeType, res.contentBase64);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await api('/products/import', { method: 'POST', body: JSON.stringify({ fileName: file.name, fileBase64: await readFileBase64(file) }) });
      setResult(res);
      history.reload();
      onImported();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <Panel title="Importar produtos por planilha" subtitle="Peso e medidas em qualquer unidade — o sistema converte para kg e cm" right={<button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>{open ? 'Ocultar' : 'Abrir'}</button>}>
      {open ? (
        <div className="grid">
          <div className="filter-row">
            <input ref={fileInput} className="input grow" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
            <button className="btn" onClick={downloadTemplate}><Icon name="download" />Baixar modelo</button>
            {busy ? <span className="muted">Importando...</span> : null}
          </div>
          {error ? <div className="notice err">{error}</div> : null}
          {result ? (
            <div className={`notice ${result.failed ? 'warn' : 'ok'}`}>
              {result.created} produto(s) criado(s), {result.updated} atualizado(s){result.failed ? `, ${result.failed} linha(s) com erro:` : '.'}
              {result.errors?.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{result.errors.slice(0, 15).map((e: any, i: number) => <li key={i}>Linha {e.linha}{e.sku ? ` (${e.sku})` : ''}: {e.erro}</li>)}</ul> : null}
            </div>
          ) : null}
          {jobs.length ? (
            <div className="table-wrap" style={{ margin: 0, border: '1px solid var(--line)', borderRadius: 8 }}>
              <table>
                <thead><tr><th>Arquivo</th><th className="text-right">Sucesso</th><th className="text-right">Falhas</th><th>Situação</th><th>Data</th></tr></thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.file_name}</td>
                      <td className="text-right">{j.success_count}</td>
                      <td className="text-right">{j.failure_count}</td>
                      <td><StatusBadge status={j.failure_count ? (j.success_count ? 'Sucesso com falhas' : 'Erro') : 'Sucesso'} /></td>
                      <td className="nowrap">{formatDateTime(j.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : <p className="muted small" style={{ margin: 0 }}>Cadastre ou atualize vários produtos de uma vez a partir de uma planilha.</p>}
    </Panel>
  );
}
