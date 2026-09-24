'use client';
import { useRef, useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { readFileBase64 } from '@/services/files';
import { formatDate, formatMoney } from '@/services/format';

export const INVOICE_KIND_HINT = 'Use "Remessa" quando o CD fica em outro estado e emite uma NF própria para o transporte (triangulação): o CT-e da transportadora cita essa NF, não a de venda.';

export function OrderInvoices({ orderId, channel }: { orderId: string; channel?: string }) {
  const { data, loading, reload } = useApi(() => api(`/orders/${orderId}/invoices`), [orderId]);
  const items: any[] = (data as any)?.items || [];
  const [kind, setKind] = useState('venda');
  const [chave, setChave] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasSale = items.some((i) => i.kind === 'venda');

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback({ ok: true, text: await action() });
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const uploadXml = (files: FileList | null) => files?.length && run(async () => {
    const payload = await Promise.all(Array.from(files).map(async (f) => ({ fileName: f.name, contentBase64: await readFileBase64(f) })));
    const res = await api('/invoices/import', { method: 'POST', body: JSON.stringify({ files: payload, orderId, kind }) });
    if (fileInput.current) fileInput.current.value = '';
    if (res.errors?.length) throw new Error(res.errors.join(' '));
    return `${res.imported + res.updated} nota(s) fiscal(is) registrada(s).`;
  });

  const addByKey = () => run(async () => {
    await api('/invoices', { method: 'POST', body: JSON.stringify({ chave, orderId, kind }) });
    setChave('');
    return 'Nota fiscal registrada pela chave de acesso.';
  });

  const changeKind = (inv: any, k: string) => run(async () => {
    await api(`/invoices/${inv.id}`, { method: 'PATCH', body: JSON.stringify({ kind: k }) });
    return `NF ${inv.numero} marcada como ${k === 'remessa' ? 'remessa' : k}.`;
  });

  const remove = (inv: any) => window.confirm(`Remover a NF ${inv.numero} deste pedido?`) && run(async () => {
    await api(`/invoices/${inv.id}`, { method: 'DELETE' });
    return `NF ${inv.numero} removida.`;
  });

  const sendToShopee = () => run(async () => {
    const res = await api(`/integrations/shopee/orders/${orderId}/invoice`, { method: 'POST', body: '{}' });
    return `NF ${res.invoiceNumber} enviada à Shopee.`;
  });

  return (
    <Panel title="Notas fiscais" subtitle="NF de venda e, em triangulação, a NF de remessa do CD" right={channel === 'shopee' && hasSale ? <button className="btn sm" disabled={busy} onClick={sendToShopee}>Enviar NF de venda à Shopee</button> : null}>
      <div className="grid">
        {loading ? <LoadingState /> : items.length === 0 ? <EmptyState text="Nenhuma nota fiscal registrada para este pedido." /> : (
          <div className="table-wrap" style={{ margin: 0, border: '1px solid var(--line)', borderRadius: 8 }}>
            <table className="stack">
              <thead><tr><th>NF</th><th>Tipo</th><th>Emitente</th><th className="text-right">Valor</th><th>CT-e</th><th></th></tr></thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id}>
                    <td className="cell-title"><strong>Nº {inv.numero}</strong>{inv.serie ? <span className="muted"> série {inv.serie}</span> : null}<span className="sub">{formatDate(inv.data_emissao)}{inv.shopee_sent_at ? ' · enviada à Shopee' : ''}</span></td>
                    <td data-label="Tipo">
                      <select className="select" style={{ minHeight: 30, padding: '2px 8px', width: 'auto' }} value={inv.kind} disabled={busy} onChange={(e) => changeKind(inv, e.target.value)}>
                        <option value="venda">Venda</option><option value="remessa">Remessa (triangulação)</option><option value="outra">Outra</option>
                      </select>
                    </td>
                    <td data-label="Emitente">{inv.emitente_nome || '-'}{inv.emitente_uf ? <span className="sub">{inv.emitente_uf}</span> : null}</td>
                    <td data-label="Valor" className="text-right nowrap">{inv.valor_total != null ? formatMoney(inv.valor_total) : '-'}</td>
                    <td data-label="CT-e">{inv.cte_numbers ? <StatusBadge status={`CT-e ${inv.cte_numbers}`} /> : <span className="muted">Aguardando</span>}</td>
                    <td data-label="" className="text-right"><button className="btn ghost sm" style={{ color: 'var(--red)' }} title="Remover" aria-label="Remover" disabled={busy} onClick={() => remove(inv)}><Icon name="trash" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="filter-row">
          <Field label="Tipo da NF" hint={INVOICE_KIND_HINT} className="grow">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="venda">NF de venda</option>
              <option value="remessa">NF de remessa (triangulação)</option>
              <option value="outra">Outra</option>
            </select>
          </Field>
        </div>
        <div className="filter-row">
          <Field label="Enviar XML" className="grow">
            <input ref={fileInput} className="input" type="file" accept=".xml,text/xml" multiple disabled={busy} onChange={(e) => uploadXml(e.target.files)} />
          </Field>
          <Field label="Ou informe a chave de acesso" className="grow">
            <input className="input" inputMode="numeric" maxLength={54} placeholder="44 dígitos" value={chave} onChange={(e) => setChave(e.target.value)} />
          </Field>
          <button className="btn" disabled={busy || chave.replace(/\D/g, '').length !== 44} onClick={addByKey}>Adicionar</button>
        </div>
        {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}
      </div>
    </Panel>
  );
}
