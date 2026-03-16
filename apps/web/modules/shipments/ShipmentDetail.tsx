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

export function ShipmentDetail({ id }: { id: string }) {
  const { data, loading, error } = useApi(() => api(`/shipments/${id}`), [id]);
  const tracking = useApi(() => api(`/tracking/shipment/${id}`), [id]);

  if (loading) return <LoadingState text="Carregando embarque..." />;
  if (error) return <ErrorState text={error} />;

  const shipment = (data as any) || {};
  const events = (tracking.data as any)?.items || [];

  return (
    <div className="grid">
      <PageHeader title={`Embarque ${id.slice(0, 8)}`} subtitle="Detalhes, volumes e timeline" actions={<Link className="btn" href="/shipments">Voltar</Link>} />

      <Panel title="Dados do embarque">
        <div className="detail-grid">
          <div className="detail-item"><small>Status</small><StatusBadge status={shipment.status} /></div>
          <div className="detail-item"><small>Transportadora</small><strong>{shipment.carrier_name || shipment.carrier_id || '-'}</strong></div>
          <div className="detail-item"><small>Pedido</small><strong className="mono">{shipment.order_id || '-'}</strong></div>
          <div className="detail-item"><small>Tracking</small><strong>{shipment.tracking_code || '-'}</strong></div>
          <div className="detail-item"><small>Criado em</small><strong>{shipment.created_at ? new Date(shipment.created_at).toLocaleString() : '-'}</strong></div>
          <div className="detail-item"><small>Atualizado em</small><strong>{shipment.updated_at ? new Date(shipment.updated_at).toLocaleString() : '-'}</strong></div>
        </div>
      </Panel>

      <Panel title="Timeline de tracking" subtitle={`Eventos: ${events.length}`}>
        {tracking.loading ? <LoadingState text="Carregando timeline..." /> : tracking.error ? <ErrorState text={tracking.error} /> : events.length === 0 ? <EmptyState text="Nenhum evento de tracking encontrado." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data/Hora</th><th>Status Externo</th><th>Status Macro</th><th>Evento</th></tr></thead>
              <tbody>
                {events.map((e: any) => (
                  <tr key={e.id}>
                    <td>{e.occurred_at ? new Date(e.occurred_at).toLocaleString() : '-'}</td>
                    <td>{e.external_status || '-'}</td>
                    <td><StatusBadge status={e.macro_status} /></td>
                    <td className="mono">{e.external_event_id || '-'}</td>
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
