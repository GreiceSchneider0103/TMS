'use client';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { TrackingUpdateModal } from './TrackingUpdateModal';
import { useState } from 'react';
import { channelLabel, formatDateTime, formatMoney, formatNumber } from '@/services/format';

export function ShipmentDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useApi(() => api(`/shipments/${id}`), [id]);
  const [update, setUpdate] = useState<string | null>(null);

  if (loading && !data) return <LoadingState text="Carregando embarque..." />;
  if (error) return <ErrorState text={error} />;

  const shipment = (data as any) || {};
  const events: any[] = shipment.tracking || [];
  const packages: any[] = shipment.packages || [];

  return (
    <div className="grid">
      <PageHeader
        title={`Embarque do pedido #${shipment.order_number || ''}`}
        subtitle={`${shipment.carrier_name || 'Transportadora'} · ${channelLabel(shipment.channel)}`}
        actions={
          <>
            <Link className="btn" href="/shipments"><Icon name="back" />Voltar</Link>
            {!['DELIVERED', 'RETURNED', 'CANCELED'].includes(shipment.status) ? (
              <>
                <button className="btn" onClick={() => setUpdate('IN_TRANSIT')}>Atualizar rastreio</button>
                <button className="btn primary" onClick={() => setUpdate('DELIVERED')}>Marcar como entregue</button>
              </>
            ) : null}
          </>
        }
      />

      <Panel title="Dados do embarque">
        <div className="detail-grid">
          <div className="detail-item"><small>Situação</small><StatusBadge status={shipment.status} /></div>
          <div className="detail-item"><small>Transportadora</small><strong>{shipment.carrier_name || '-'}</strong></div>
          <div className="detail-item"><small>Pedido</small><strong><Link href={`/orders/${shipment.order_id}`} style={{ color: 'var(--brand)' }}>#{shipment.order_number || '-'}</Link></strong></div>
          <div className="detail-item"><small>Código de rastreio</small><strong>{shipment.tracking_code || 'Aguardando'}</strong></div>
          <div className="detail-item"><small>Nota fiscal</small><strong>{shipment.invoice_number || '-'}</strong></div>
          <div className="detail-item"><small>Valor do frete</small><strong>{(shipment.freight_amount ?? shipment.quoted_amount) != null ? formatMoney(shipment.freight_amount ?? shipment.quoted_amount) : '-'}</strong></div>
          <div className="detail-item"><small>Prazo de transporte</small><strong>{(shipment.transit_days ?? shipment.total_days) != null ? `${shipment.transit_days ?? shipment.total_days} dia(s) útil(eis)` : '-'}</strong></div>
          <div className="detail-item"><small>Despachado em</small><strong>{formatDateTime(shipment.dispatched_at)}</strong></div>
          <div className="detail-item"><small>Previsão de entrega</small><strong>{shipment.estimated_delivery_date ? new Date(`${String(shipment.estimated_delivery_date).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '-'}</strong></div>
          <div className="detail-item"><small>Rastreio</small><strong>{shipment.tracking_source === 'manual' ? 'Atualizado manualmente' : 'Automático'}</strong></div>
          <div className="detail-item"><small>Criado em</small><strong>{formatDateTime(shipment.created_at)}</strong></div>
          <div className="detail-item"><small>Entregue em</small><strong>{formatDateTime(shipment.delivered_at)}{shipment.delivered_to ? ` · ${shipment.delivered_to}` : ''}</strong></div>
          {shipment.delivery_notes ? <div className="detail-item"><small>Observações</small><strong>{shipment.delivery_notes}</strong></div> : null}
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="Histórico de rastreio" subtitle={events.length ? `${events.length} evento(s)` : undefined}>
          {events.length === 0 ? <EmptyState text="Nenhum evento de rastreio recebido ainda." /> : (
            <ul className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <strong>{e.external_status || '-'}</strong>
                  <span className="muted small">{formatDateTime(e.occurred_at)} · </span><StatusBadge status={e.macro_status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Volumes" subtitle={packages.length ? `${packages.length} volume(s)` : undefined}>
          {packages.length === 0 ? <EmptyState text="Nenhum volume informado." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Volume</th><th className="text-right">Peso</th><th>Dimensões</th><th>Rastreio</th></tr></thead>
                <tbody>
                  {packages.map((p) => (
                    <tr key={p.id || p.package_number}>
                      <td>{p.package_number}</td>
                      <td className="text-right">{p.weight_kg != null ? `${formatNumber(p.weight_kg)} kg` : '-'}</td>
                      <td>{p.length_cm ? `${p.length_cm} × ${p.width_cm} × ${p.height_cm} cm` : '-'}</td>
                      <td>{p.tracking_code || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {update ? <TrackingUpdateModal shipment={{ id: shipment.id, carrier_name: shipment.carrier_name, tracking_code: shipment.tracking_code }} initialStatus={update} onClose={() => setUpdate(null)} onSaved={() => { setUpdate(null); reload(); }} /> : null}
    </div>
  );
}
