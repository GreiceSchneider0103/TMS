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

export function ShipmentsList() {
  const { data, loading, error } = useApi(() => api('/shipments'), []);
  const items = (data as any)?.items || [];

  return (
    <div className="grid">
      <PageHeader title="Embarques" subtitle="Controle de envios e despachos" actions={<button className="btn primary">Criar Embarque</button>} />
      <Panel title="Lista de Embarques" right={<button className="btn">Sincronizar Tudo</button>}>
        {loading ? <LoadingState text="Carregando embarques..." /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Shipment ID</th><th>Pedido</th><th>Transportadora</th><th>Código Rastreio</th><th>Status</th><th>Data Envio</th><th>Ações</th></tr></thead>
              <tbody>
                {items.map((s: any) => (
                  <tr key={s.id}>
                    <td className="mono">{s.id.slice(0, 8)}</td>
                    <td>{s.order_id?.slice(0, 8)}</td>
                    <td>{s.carrier_name || s.carrier_id || '-'}</td>
                    <td>{s.tracking_code || '-'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn ghost" href={`/shipments/${s.id}`}>Ver</Link>
                        <button className="btn">Sync</button>
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
