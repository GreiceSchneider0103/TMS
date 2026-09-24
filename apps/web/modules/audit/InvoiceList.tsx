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
import { channelLabel, formatDate, formatDocument, formatMoney } from '@/services/format';
import { INVOICE_KIND_HINT } from '@/modules/orders/OrderInvoices';

export function InvoiceList() {
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);
  const [linking, setLinking] = useState<any>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data, loading, error, reload } = useApi(() => api(`/invoices${onlyUnlinked ? '?unlinked=true' : ''}`), [onlyUnlinked]);
  const items: any[] = (data as any)?.items || [];

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await Promise.all(Array.from(files).map(async (f) => ({ fileName: f.name, contentBase64: await readFileBase64(f) })));
      const res = await api('/invoices/import', { method: 'POST', body: JSON.stringify({ files: payload }) });
      setFeedback({
        ok: !res.errors?.length,
        text: `${res.imported} NF(s) nova(s), ${res.updated} atualizada(s). ${res.linked} ligada(s) a pedidos automaticamente${res.unlinked ? `, ${res.unlinked} sem pedido (ligue manualmente abaixo)` : ''}.`,
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

  return (
    <div className="grid">
      <Panel title="Importar NF-e" subtitle="XMLs das notas de venda e de remessa (vários de uma vez)">
        <div className="filter-row">
          <input ref={fileInput} className="input grow" type="file" accept=".xml,text/xml" multiple disabled={busy} onChange={(e) => importFiles(e.target.files)} />
          {busy ? <span className="muted">Importando...</span> : null}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          A nota é ligada ao pedido automaticamente pelo número do pedido escrito na NF ou, na triangulação, pela NF de venda que a nota de remessa referencia.
          O ERP e os marketplaces também podem enviar as notas automaticamente pela integração.
        </p>
      </Panel>

      {feedback ? (
        <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>
          {feedback.text}
          {feedback.details?.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{feedback.details.slice(0, 10).map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
        </div>
      ) : null}

      <Panel title="Notas fiscais" subtitle={loading ? undefined : `${items.length} nota(s)`} right={
        <div className="row-actions">
          <label className="check small"><input type="checkbox" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} />Somente sem pedido</label>
          <button className="btn sm" onClick={reload}><Icon name="refresh" />Atualizar</button>
        </div>
      }>
        {loading ? <LoadingState /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState text="Nenhuma nota fiscal registrada." /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr><th>NF</th><th>Tipo</th><th>Emitente</th><th>Destino</th><th className="text-right">Valor</th><th>Pedido</th><th>CT-e</th><th></th></tr></thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id}>
                    <td className="cell-title"><strong>Nº {inv.numero}</strong>{inv.serie ? <span className="muted"> série {inv.serie}</span> : null}<span className="sub">{formatDate(inv.data_emissao)}</span></td>
                    <td data-label="Tipo"><StatusBadge status={inv.kind} /></td>
                    <td data-label="Emitente">{inv.emitente_nome || formatDocument(inv.emitente_cnpj)}{inv.emitente_uf ? <span className="sub">{inv.emitente_uf}</span> : null}</td>
                    <td data-label="Destino">{inv.destinatario_nome || '-'}{inv.destino_uf ? <span className="sub">{inv.destino_uf}</span> : null}</td>
                    <td data-label="Valor" className="text-right nowrap">{inv.valor_total != null ? formatMoney(inv.valor_total) : '-'}</td>
                    <td data-label="Pedido">{inv.order_id ? <Link href={`/orders/${inv.order_id}`} style={{ color: 'var(--brand)' }}>#{inv.order_number}</Link> : <StatusBadge status="Sem pedido" />}{inv.channel ? <span className="sub">{channelLabel(inv.channel)}</span> : null}</td>
                    <td data-label="CT-e">{inv.has_cte ? <StatusBadge status="Recebido" /> : <span className="muted">Aguardando</span>}</td>
                    <td data-label="" className="text-right"><button className={`btn sm ${inv.order_id ? 'ghost' : 'primary'}`} onClick={() => setLinking(inv)}>{inv.order_id ? 'Alterar' : 'Ligar ao pedido'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {linking ? <LinkInvoiceModal invoice={linking} onClose={() => setLinking(null)} onSaved={(text) => { setLinking(null); setFeedback({ ok: true, text }); reload(); }} /> : null}
    </div>
  );
}

function LinkInvoiceModal({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: (text: string) => void }) {
  const orders = useApi(() => api('/orders?limit=200'), []);
  const [orderId, setOrderId] = useState(invoice.order_id || '');
  const [kind, setKind] = useState(invoice.kind || 'venda');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items: any[] = (orders.data as any)?.items || [];

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await api(`/invoices/${invoice.id}`, { method: 'PATCH', body: JSON.stringify({ orderId: orderId || null, kind }) });
      onSaved(`NF ${invoice.numero} atualizada.${res.ctesLinked ? ` ${res.ctesLinked} CT-e(s) ligado(s) ao embarque.` : ''}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`NF nº ${invoice.numero}`} onClose={onClose} size="sm">
      {orders.loading ? <LoadingState /> : (
        <Field label="Pedido">
          <select className="select" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Sem pedido</option>
            {items.map((o) => <option key={o.id} value={o.id}>#{o.order_number} · {channelLabel(o.channel)} · {formatDate(o.created_at)}</option>)}
          </select>
        </Field>
      )}
      <Field label="Tipo da NF" hint={INVOICE_KIND_HINT}>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="venda">NF de venda</option>
          <option value="remessa">NF de remessa (triangulação)</option>
          <option value="outra">Outra</option>
        </select>
      </Field>
      {error ? <div className="notice err">{error}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}
