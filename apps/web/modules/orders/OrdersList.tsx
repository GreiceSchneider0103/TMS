'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { downloadCsv } from '@/services/csv';
import { deadlineInfo } from '@/services/deadlines';
import { ORDER_STATUS_OPTIONS, channelLabel, formatCep, formatDate, formatMoney, statusInfo } from '@/services/format';

export function OrdersList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const [status, setStatus] = useState('');
  const [carrier, setCarrier] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busyId, setBusyId] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const qs = new URLSearchParams({ status, carrier, from, to, limit: '200' }).toString();
  const { data, loading, error, reload } = useApi(() => api(`/orders?${qs}`), [qs]);
  const carriers = useApi(() => api('/carriers'), []);

  const allItems = (data as any)?.items || [];
  const items = q
    ? allItems.filter((o: any) => `${o.order_number} ${o.external_id}`.toLowerCase().includes(q.toLowerCase()))
    : allItems;

  async function dispatch(order: any) {
    const isShopee = order.channel === 'shopee';
    const question = isShopee
      ? `Despachar o pedido ${order.order_number} na Shopee? A Shopee vai gerar o código de rastreio.`
      : `Despachar o pedido ${order.order_number} com ${order.carrier_name || 'a transportadora da cotação selecionada'}?`;
    if (!window.confirm(question)) return;
    setBusyId(order.id);
    setFeedback(null);
    try {
      if (isShopee) {
        const res = await api(`/integrations/shopee/orders/${order.id}/dispatch`, { method: 'POST', body: '{}' });
        setFeedback({ ok: true, text: `Pedido ${order.order_number} despachado na Shopee${res?.trackingCode ? ` — rastreio ${res.trackingCode}` : ''}.` });
      } else {
        await api('/shipments', { method: 'POST', body: JSON.stringify({ orderId: order.id, quoteResultId: order.selected_quote_result_id }) });
        setFeedback({ ok: true, text: `Embarque criado para o pedido ${order.order_number}.` });
      }
      reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível despachar o pedido ${order.order_number}: ${e.message}` });
    } finally {
      setBusyId('');
    }
  }

  function exportCsv() {
    downloadCsv('pedidos.csv', items.map((o: any) => ({
      Pedido: o.order_number,
      Canal: channelLabel(o.channel),
      Cliente: o.recipient_name || '',
      CEP: formatCep(o.destination_postal_code),
      Transportadora: o.carrier_name || '',
      Valor: Number(o.total_amount || 0).toFixed(2).replace('.', ','),
      Situação: statusInfo(o.status).label,
      Data: formatDate(o.created_at)
    })));
  }

  function actionFor(o: any) {
    if (o.shipment_id) return <Link className="btn sm" href={`/shipments/${o.shipment_id}`}>Ver embarque</Link>;
    if (o.channel === 'shopee' || o.selected_quote_result_id) {
      return <button className="btn primary sm" disabled={busyId === o.id} onClick={() => dispatch(o)}>{busyId === o.id ? 'Despachando...' : 'Despachar'}</button>;
    }
    return <Link className="btn primary sm" href={`/quotes?orderId=${o.id}`}>Cotar frete</Link>;
  }

  return (
    <div className="grid">
      <PageHeader
        title="Pedidos"
        subtitle="Pedidos recebidos do ERP e dos marketplaces"
        actions={<button className="btn" disabled={!items.length} onClick={exportCsv}><Icon name="download" />Exportar</button>}
      />

      {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

      <Panel title="Lista de pedidos" subtitle={loading ? undefined : `${items.length} pedido(s)`} right={<button className="btn sm" onClick={reload}><Icon name="refresh" />Atualizar</button>}>
        <div className="filter-row">
          <Field label="Situação">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas</option>
              {ORDER_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusInfo(s).label}</option>)}
            </select>
          </Field>
          <Field label="Transportadora">
            <select className="select" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              <option value="">Todas</option>
              {((carriers.data as any)?.items || []).map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="De"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Até"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {q ? <button className="btn ghost" onClick={() => router.push('/orders')}><Icon name="x" />Limpar busca “{q}”</button> : null}
        </div>

        {loading ? <LoadingState text="Carregando pedidos..." /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState text="Nenhum pedido encontrado para os filtros selecionados." /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>CEP destino</th>
                  <th>Transportadora</th>
                  <th className="text-right">Valor</th>
                  <th>Situação</th>
                  <th>Prazo</th>
                  <th>Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((o: any) => (
                  <tr key={o.id}>
                    <td className="cell-title">
                      <Link href={`/orders/${o.id}`} className="nowrap" style={{ color: 'var(--brand)', fontWeight: 600 }}>#{o.order_number || o.external_id}</Link>
                      <span className="sub">{channelLabel(o.channel)}</span>
                    </td>
                    <td data-label="Cliente">{o.recipient_name || '-'}</td>
                    <td data-label="CEP destino" className="nowrap">{formatCep(o.destination_postal_code)}</td>
                    <td data-label="Transportadora">{o.carrier_name || '-'}</td>
                    <td data-label="Valor" className="text-right nowrap">{formatMoney(o.total_amount)}</td>
                    <td data-label="Situação"><StatusBadge status={o.status} /></td>
                    <td data-label="Prazo">{(() => { const d = deadlineInfo(o); return d ? <span className={`badge ${d.tone}`}>{d.label}</span> : '-'; })()}</td>
                    <td data-label="Data" className="nowrap">{formatDate(o.created_at)}</td>
                    <td data-label="" className="text-right">
                      <div className="row-actions">{actionFor(o)}</div>
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
