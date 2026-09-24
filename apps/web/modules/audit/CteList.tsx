'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { readFileBase64 } from '@/services/files';
import { formatDate, formatDocument, formatMoney, statusInfo } from '@/services/format';

export function CteList() {
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);
  const [linking, setLinking] = useState<any>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data, loading, error, reload } = useApi(() => api(`/ctes${onlyUnmatched ? '?unmatched=true' : ''}`), [onlyUnmatched]);
  const items: any[] = (data as any)?.items || [];

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await Promise.all(Array.from(files).map(async (f) => ({ fileName: f.name, contentBase64: await readFileBase64(f) })));
      const res = await api('/ctes/import', { method: 'POST', body: JSON.stringify({ files: payload }) });
      setFeedback({
        ok: !res.errors?.length,
        text: `${res.imported} CT-e(s) novo(s), ${res.updated} atualizado(s), ${res.matched} vinculado(s) automaticamente a embarques.${res.errors?.length ? ` ${res.errors.length} arquivo(s) com problema:` : ''}`,
        details: res.errors
      });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível importar: ${e.message}` });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function unlink(cte: any) {
    if (!window.confirm(`Remover o vínculo do CT-e ${cte.numero} com o pedido #${cte.order_number}?`)) return;
    try {
      await api(`/ctes/${cte.id}/link`, { method: 'PATCH', body: JSON.stringify({ shipmentId: null }) });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: e.message });
    }
  }

  return (
    <div className="grid">
      <Panel title="Importar XML de CT-e" subtitle="Envie os XMLs recebidos das transportadoras (pode selecionar vários de uma vez)">
        <div className="filter-row">
          <input ref={fileInput} className="input grow" type="file" accept=".xml,text/xml" multiple disabled={busy} onChange={(e) => importFiles(e.target.files)} />
          {busy ? <span className="muted">Importando...</span> : null}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          O vínculo com o embarque é automático quando o número do CT-e ou o número da nota fiscal transportada confere com o embarque.
          Os demais aparecem como “sem vínculo” para ligar manualmente.
        </p>
      </Panel>

      {feedback ? (
        <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>
          {feedback.text}
          {feedback.details?.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{feedback.details.slice(0, 10).map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
        </div>
      ) : null}

      <Panel title="CT-es recebidos" subtitle={loading ? undefined : `${items.length} CT-e(s)`} right={
        <div className="row-actions">
          <label className="check small"><input type="checkbox" checked={onlyUnmatched} onChange={(e) => setOnlyUnmatched(e.target.checked)} />Somente sem vínculo</label>
          <button className="btn sm" onClick={reload}><Icon name="refresh" />Atualizar</button>
        </div>
      }>
        {loading ? <LoadingState /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState text="Nenhum CT-e recebido ainda. Importe os XMLs ou busque na SEFAZ." /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr><th>CT-e</th><th>Transportadora</th><th>Destino</th><th className="text-right">Valor</th><th>Origem</th><th>Embarque</th><th></th></tr></thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-title">
                      <strong>Nº {c.numero}</strong>{c.serie ? <span className="muted"> série {c.serie}</span> : null}
                      <span className="sub">{formatDate(c.data_emissao)}</span>
                    </td>
                    <td data-label="Transportadora">{c.carrier_name || c.emitente_nome || '-'}<span className="sub">{formatDocument(c.emitente_cnpj)}</span></td>
                    <td data-label="Destino">{[c.destino_cidade, c.destino_uf].filter(Boolean).join(' / ') || '-'}</td>
                    <td data-label="Valor" className="text-right nowrap">{formatMoney(c.valor_prestacao)}</td>
                    <td data-label="Origem">{c.source === 'sefaz' ? 'SEFAZ' : 'XML enviado'}</td>
                    <td data-label="Embarque">
                      {c.shipment_id ? (
                        <><Link href={`/shipments/${c.shipment_id}`} style={{ color: 'var(--brand)' }}>Pedido #{c.order_number}</Link>{c.match_method === 'automatico' ? <span className="sub">vínculo automático</span> : null}</>
                      ) : <StatusBadge status="Sem vínculo" />}
                    </td>
                    <td data-label="" className="text-right">
                      {c.shipment_id
                        ? <button className="btn ghost sm" onClick={() => unlink(c)}>Desvincular</button>
                        : <button className="btn primary sm" onClick={() => setLinking(c)}>Vincular</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {linking ? <LinkModal cte={linking} onClose={() => setLinking(null)} onLinked={() => { setLinking(null); reload(); }} /> : null}
    </div>
  );
}

function LinkModal({ cte, onClose, onLinked }: { cte: any; onClose: () => void; onLinked: () => void }) {
  const shipments = useApi(() => api('/shipments'), []);
  const [shipmentId, setShipmentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items: any[] = (shipments.data as any)?.items || [];

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api(`/ctes/${cte.id}/link`, { method: 'PATCH', body: JSON.stringify({ shipmentId }) });
      onLinked();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Vincular CT-e nº ${cte.numero}`} onClose={onClose} size="sm">
      <div className="detail-grid">
        <div className="detail-item"><small>Transportadora</small><strong>{cte.carrier_name || cte.emitente_nome || '-'}</strong></div>
        <div className="detail-item"><small>Valor</small><strong>{formatMoney(cte.valor_prestacao)}</strong></div>
        <div className="detail-item"><small>Destinatário</small><strong>{cte.destinatario_nome || '-'}</strong></div>
        <div className="detail-item"><small>Destino</small><strong>{[cte.destino_cidade, cte.destino_uf].filter(Boolean).join(' / ') || '-'}</strong></div>
      </div>
      {shipments.loading ? <LoadingState /> : (
        <Field label="Embarque" required>
          <select className="select" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
            <option value="">Escolha o embarque...</option>
            {items.map((s) => <option key={s.id} value={s.id}>Pedido #{s.order_number} · {s.carrier_name || '-'} · {formatDate(s.created_at)} · {statusInfo(s.status).label}</option>)}
          </select>
        </Field>
      )}
      {error ? <div className="notice err">{error}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy || !shipmentId} onClick={save}>{busy ? 'Salvando...' : 'Vincular'}</button>
      </div>
    </Modal>
  );
}
