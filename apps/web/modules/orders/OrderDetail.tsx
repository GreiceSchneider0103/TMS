'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { OrderInvoices } from './OrderInvoices';
import { ManualDispatchModal } from './ManualDispatchModal';
import { EditOrderModal } from './EditOrderModal';
import { TrackingUpdateModal } from '@/modules/shipments/TrackingUpdateModal';
import { channelLabel, formatCep, formatDate, formatDateTime, formatMoney, formatNumber } from '@/services/format';
import { deadlineInfo, daysBetween } from '@/services/deadlines';

const CLOSED = ['DELIVERED', 'RETURNED', 'CANCELED'];

export function OrderDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useApi(() => api(`/orders/${id}`), [id]);
  const issues = useApi(() => api(`/integration-issues?orderId=${id}`), [id]);
  const [modal, setModal] = useState<null | 'edit' | 'dispatch' | { shipment: any; status: string }>(null);
  const [feedback, setFeedback] = useState('');

  if (loading && !data) return <LoadingState text="Carregando pedido..." />;
  if (error) return <ErrorState text={error} />;

  const order = (data as any) || {};
  const items: any[] = order.items || [];
  const shipments: any[] = order.shipments || [];
  const current = shipments.find((s) => !['CANCELED', 'RETURNED'].includes(s.status)) || shipments[0] || null;
  const openIssues: any[] = (issues.data as any)?.items || [];
  const p = order.raw_payload || {};
  const skus: string[] = Array.isArray(p.skus) ? p.skus : [];
  const dims = [p.length_cm, p.width_cm, p.height_cm].every((v) => v !== undefined && v !== null) ? `${p.length_cm} × ${p.width_cm} × ${p.height_cm} cm` : '-';
  const place = [p.city, p.state].filter(Boolean).join(' / ');
  const deadline = deadlineInfo({ ...order, ...(current ? { shipment_id: current.id, dispatched_at: current.dispatched_at, estimated_delivery_date: current.estimated_delivery_date, delivered_at: current.delivered_at } : {}) });
  const canDispatch = !current && !order.integration_ignored;

  const done = (msg: string) => { setModal(null); setFeedback(msg); reload(); issues.reload(); };

  return (
    <div className="grid">
      <PageHeader
        title={`Pedido #${order.order_number || order.external_id || ''}`}
        subtitle={`${channelLabel(order.channel)} · criado em ${formatDateTime(order.created_at)}`}
        actions={
          <>
            <Link className="btn" href="/orders"><Icon name="back" />Voltar</Link>
            <button className="btn" onClick={() => setModal('edit')}><Icon name="edit" />Editar</button>
            {canDispatch ? <Link className="btn" href={`/quotes?orderId=${order.id}`}>Cotar frete</Link> : null}
            {canDispatch ? <button className="btn primary" onClick={() => setModal('dispatch')}>Despachar manualmente</button> : null}
            {current && !CLOSED.includes(current.status) ? <button className="btn primary" onClick={() => setModal({ shipment: current, status: 'DELIVERED' })}>Marcar como entregue</button> : null}
          </>
        }
      />

      {feedback ? <div className="notice ok">{feedback}</div> : null}
      {order.integration_ignored ? <div className="notice info">Frete gerenciado pelo canal ({order.marketplace_carrier || 'de-para'}): este pedido não é cotado nem auditado pelo TMS.</div> : null}
      {openIssues.length ? (
        <div className="notice warn">
          <strong>Pendências de integração:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{openIssues.map((i) => <li key={i.id}>{i.message}</li>)}</ul>
          <div style={{ marginTop: 6 }}><Link className="btn ghost sm" href="/logs?tab=pendencias">Ver pendências</Link></div>
        </div>
      ) : null}

      <Panel title="Dados gerais">
        <div className="detail-grid">
          <div className="detail-item"><small>Situação</small><StatusBadge status={order.status} /></div>
          <div className="detail-item"><small>Canal de venda</small><strong>{channelLabel(order.channel)}</strong></div>
          <div className="detail-item"><small>Valor do pedido</small><strong>{formatMoney(order.total_amount)}</strong></div>
          <div className="detail-item"><small>Valor da nota fiscal</small><strong>{formatMoney(order.invoice_amount ?? order.total_amount)}</strong></div>
          <div className="detail-item"><small>Frete cobrado do cliente</small><strong>{order.shipping_amount != null ? formatMoney(order.shipping_amount) : '-'}</strong></div>
          <div className="detail-item"><small>Transportadora do canal</small><strong>{order.marketplace_carrier || '-'}</strong></div>
          <div className="detail-item"><small>Código no canal</small><strong>{order.external_id || '-'}</strong></div>
        </div>
      </Panel>

      <Panel title="Datas e prazos" right={deadline ? <StatusBadge status={deadline.label} /> : null}>
        <div className="detail-grid">
          <div className="detail-item"><small>Data da venda</small><strong>{formatDateTime(order.sold_at || order.created_at)}</strong></div>
          <div className="detail-item"><small>Postar até</small><strong>{formatDateTime(order.ship_by_date)}</strong></div>
          <div className="detail-item"><small>Despachado em</small><strong>{formatDateTime(current?.dispatched_at)}</strong></div>
          <div className="detail-item"><small>Prazo de transporte</small><strong>{current?.transit_days != null ? `${current.transit_days} dia(s) útil(eis)` : '-'}</strong></div>
          <div className="detail-item"><small>Previsão de entrega</small><strong>{formatDate(current?.estimated_delivery_date)}</strong></div>
          <div className="detail-item"><small>Prometido ao cliente</small><strong>{formatDate(order.promised_delivery_date)}</strong></div>
          <div className="detail-item"><small>Entregue em</small><strong>{formatDateTime(current?.delivered_at)}{current?.delivered_to ? ` · ${current.delivered_to}` : ''}</strong></div>
          <div className="detail-item"><small>Dias até despachar</small><strong>{daysBetween(order.sold_at || order.created_at, current?.dispatched_at) ?? '-'}</strong></div>
          <div className="detail-item"><small>Dias em transporte</small><strong>{daysBetween(current?.dispatched_at, current?.delivered_at) ?? '-'}</strong></div>
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="Entrega">
          <div className="detail-grid">
            <div className="detail-item"><small>CEP de destino</small><strong>{formatCep(p.postal_code)}</strong></div>
            <div className="detail-item"><small>Cidade / UF</small><strong>{place || '-'}</strong></div>
            <div className="detail-item"><small>Tipo de destinatário</small><strong>{p.recipient_type === 'PJ' ? 'Pessoa jurídica' : p.recipient_type === 'PF' ? 'Pessoa física' : '-'}</strong></div>
            <div className="detail-item"><small>Peso</small><strong>{p.weight_kg != null ? `${formatNumber(p.weight_kg)} kg` : '-'}</strong></div>
            <div className="detail-item"><small>Dimensões (C × L × A)</small><strong>{dims}</strong></div>
          </div>
        </Panel>

        <Panel title="Embarques" subtitle={shipments.length ? undefined : 'Pedido ainda não despachado'}>
          {shipments.length === 0 ? <EmptyState text="Nenhum embarque para este pedido." /> : (
            <div className="table-wrap">
              <table className="stack">
                <thead><tr><th>Transportadora</th><th>Situação</th><th></th></tr></thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr key={s.id}>
                      <td className="cell-title">{s.carrier_name || '-'}<span className="sub">{s.tracking_code ? `Rastreio ${s.tracking_code}` : 'Sem código de rastreio'}{s.tracking_source === 'manual' ? ' · manual' : ''}</span></td>
                      <td data-label="Situação"><StatusBadge status={s.status} /></td>
                      <td data-label="" className="text-right">
                        <div className="row-actions">
                          {!CLOSED.includes(s.status) ? <button className="btn sm" onClick={() => setModal({ shipment: s, status: 'IN_TRANSIT' })}>Atualizar rastreio</button> : null}
                          <Link className="btn ghost sm" href={`/shipments/${s.id}`}>Ver</Link>
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

      <OrderInvoices orderId={order.id || id} channel={order.channel} />

      <Panel title="Itens do pedido">
        {items.length === 0 && skus.length === 0 ? <EmptyState text="Pedido sem itens vinculados." /> : items.length === 0 ? (
          <div className="chips">{skus.map((sku) => <span key={sku} className="badge neutral">{sku}</span>)}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th className="text-right">Quantidade</th><th className="text-right">Preço unitário</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id || `${item.sku}-${item.qty}`}>
                    <td>{item.sku || '-'}</td>
                    <td className="text-right">{item.qty ?? '-'}</td>
                    <td className="text-right">{formatMoney(item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {modal === 'edit' ? <EditOrderModal order={order} onClose={() => setModal(null)} onSaved={() => done('Pedido atualizado.')} /> : null}
      {modal === 'dispatch' ? <ManualDispatchModal order={order} onClose={() => setModal(null)} onSaved={() => done('Despacho registrado.')} /> : null}
      {modal && typeof modal === 'object' ? <TrackingUpdateModal shipment={modal.shipment} initialStatus={modal.status} onClose={() => setModal(null)} onSaved={() => done('Rastreio atualizado.')} /> : null}
    </div>
  );
}
