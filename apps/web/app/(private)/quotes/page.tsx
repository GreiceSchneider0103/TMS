'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { downloadCsv } from '@/services/csv';
import { channelLabel, formatCep, formatDateTime, formatMoney, statusInfo } from '@/services/format';

function QuotesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || '';
  const orders = useApi(() => api('/orders?limit=200'), []);
  const [results, setResults] = useState<any[]>([]);
  const [quotedAt, setQuotedAt] = useState<string | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const orderItems: any[] = (orders.data as any)?.items || [];
  const order = orderItems.find((o) => o.id === orderId);
  const selected = results.find((r) => r.selected);

  useEffect(() => {
    setResults([]);
    setQuotedAt(null);
    setFeedback(null);
    if (!orderId) return;
    let active = true;
    setLoadingQuotes(true);
    api(`/quotes/order/${orderId}`)
      .then((res) => {
        if (!active) return;
        setResults(res.results || []);
        setQuotedAt(res.request?.created_at || null);
      })
      .catch((e) => active && setFeedback({ ok: false, text: e.message }))
      .finally(() => active && setLoadingQuotes(false));
    return () => {
      active = false;
    };
  }, [orderId]);

  async function calculate() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api(`/quotes/automatic/${orderId}`, { method: 'POST', body: '{}' });
      setResults(res.results || []);
      setQuotedAt(new Date().toISOString());
      if (!res.results?.length) setFeedback({ ok: false, text: 'Nenhuma transportadora atende este destino nas tabelas de frete publicadas.' });
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível calcular a cotação: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function choose(quote: any) {
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/quotes/results/${quote.id}/select`, { method: 'PATCH', body: '{}' });
      setResults((prev) => prev.map((r) => ({ ...r, selected: r.id === quote.id })));
      setFeedback({ ok: true, text: `Cotação de ${quote.carrier_name || 'transportadora'} selecionada.` });
      orders.reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível selecionar a cotação: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function dispatch() {
    if (!selected || !order) return;
    const isShopee = order.channel === 'shopee';
    if (!window.confirm(isShopee ? `Despachar o pedido ${order.order_number} na Shopee?` : `Despachar o pedido ${order.order_number} com ${selected.carrier_name || 'a transportadora selecionada'}?`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = isShopee
        ? await api(`/integrations/shopee/orders/${order.id}/dispatch`, { method: 'POST', body: '{}' })
        : await api('/shipments', { method: 'POST', body: JSON.stringify({ orderId: order.id, quoteResultId: selected.id }) });
      const shipmentId = res?.shipment?.id || res?.id;
      if (shipmentId) return router.push(`/shipments/${shipmentId}`);
      setFeedback({ ok: true, text: 'Pedido despachado.' });
      orders.reload();
    } catch (e: any) {
      setFeedback({ ok: false, text: `Não foi possível despachar: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  const alreadyShipped = Boolean(order?.shipment_id);

  return (
    <div className="grid">
      <PageHeader
        title="Cotações"
        subtitle="Calcule o frete de um pedido e escolha a transportadora"
        actions={<button className="btn" disabled={!results.length} onClick={() => downloadCsv('cotacoes.csv', results.map((q) => ({ Transportadora: q.carrier_name || '', Valor: Number(q.total_amount || 0).toFixed(2).replace('.', ','), 'Prazo (dias)': q.total_days ?? '', Selecionada: q.selected ? 'Sim' : 'Não' })))}><Icon name="download" />Exportar</button>}
      />

      <Panel title="Pedido">
        <div className="filter-row">
          <Field label="Selecione o pedido" className="grow">
            <select className="select" value={orderId} disabled={orders.loading} onChange={(e) => router.replace(e.target.value ? `/quotes?orderId=${e.target.value}` : '/quotes')}>
              <option value="">{orders.loading ? 'Carregando pedidos...' : 'Escolha um pedido...'}</option>
              {orderItems.map((o) => (
                <option key={o.id} value={o.id}>#{o.order_number} · {channelLabel(o.channel)} · {statusInfo(o.status).label}</option>
              ))}
            </select>
          </Field>
          <button className="btn primary" disabled={!orderId || busy || alreadyShipped} onClick={calculate}>{busy ? 'Calculando...' : results.length ? 'Recalcular cotação' : 'Calcular cotação'}</button>
        </div>
        {order ? (
          <div className="detail-grid">
            <div className="detail-item"><small>Situação</small><StatusBadge status={order.status} /></div>
            <div className="detail-item"><small>CEP de destino</small><strong>{formatCep(order.destination_postal_code)}</strong></div>
            <div className="detail-item"><small>Valor do pedido</small><strong>{formatMoney(order.total_amount)}</strong></div>
            <div className="detail-item"><small>Última cotação</small><strong>{formatDateTime(quotedAt)}</strong></div>
          </div>
        ) : null}
        {alreadyShipped ? <div className="notice info" style={{ marginTop: 12 }}>Este pedido já foi despachado. <Link href={`/shipments/${order.shipment_id}`} style={{ textDecoration: 'underline' }}>Ver embarque</Link></div> : null}
      </Panel>

      {feedback ? <div className={`notice ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div> : null}

      <Panel
        title="Opções de frete"
        subtitle={results.length ? 'Ordenadas da melhor para a pior opção' : undefined}
        right={selected && !alreadyShipped ? <button className="btn primary" disabled={busy} onClick={dispatch}>Despachar com {selected.carrier_name || 'esta cotação'}</button> : null}
      >
        {!orderId ? <EmptyState text="Selecione um pedido para ver ou calcular as opções de frete." /> : loadingQuotes ? <LoadingState text="Carregando cotações..." /> : results.length === 0 ? <EmptyState text="Este pedido ainda não foi cotado. Clique em “Calcular cotação”." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Transportadora</th><th className="text-right">Valor do frete</th><th className="text-right">Prazo</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {results.map((q, i) => (
                  <tr key={q.id} className={q.selected ? 'selected' : ''}>
                    <td>{q.ranking || i + 1}</td>
                    <td>{q.carrier_name || 'Transportadora sem cadastro'}</td>
                    <td className="text-right nowrap">{formatMoney(q.total_amount)}</td>
                    <td className="text-right nowrap">{q.total_days != null ? `${q.total_days} dia(s)` : '-'}</td>
                    <td><StatusBadge status={q.selected ? 'Selecionada' : 'Disponível'} /></td>
                    <td className="text-right">
                      {!q.selected && !alreadyShipped ? <button className="btn sm" disabled={busy} onClick={() => choose(q)}>Selecionar</button> : null}
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

export default function QuotesPage() {
  return (
    <Suspense>
      <QuotesInner />
    </Suspense>
  );
}
