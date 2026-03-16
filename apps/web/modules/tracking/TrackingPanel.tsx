'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function TrackingPanel() {
  const shipments = useApi(() => api('/shipments'), []);
  const [selected, setSelected] = useState<string>('');
  const timeline = useApi(() => selected ? api(`/tracking/shipment/${selected}`) : Promise.resolve({ items: [] } as any), [selected]);

  const shipmentItems = (shipments.data as any)?.items || [];
  const events = (timeline.data as any)?.items || [];

  return (
    <div className="grid">
      <PageHeader title="Tracking" subtitle="Acompanhe status de entrega dos pedidos" />

      <Panel title="Rastreamento">
        <div className="filter-row">
          <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Selecione um embarque...</option>
            {shipmentItems.map((s: any) => (
              <option key={s.id} value={s.id}>{s.tracking_code || s.id.slice(0, 8)} - {s.status}</option>
            ))}
          </select>
          <button className="btn primary" onClick={() => setSelected(selected)}>Rastrear</button>
        </div>
      </Panel>

      <Panel title="Timeline de eventos">
        {!selected ? <div className="empty-state">Selecione um embarque para visualizar eventos.</div> : timeline.loading ? <p>Carregando timeline...</p> : timeline.error ? <p className="text-error">{timeline.error}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data/Hora</th><th>Status</th><th>Detalhe</th></tr></thead>
              <tbody>
                {events.map((e: any) => (
                  <tr key={e.id}>
                    <td>{e.occurred_at ? new Date(e.occurred_at).toLocaleString() : '-'}</td>
                    <td><StatusBadge status={e.macro_status || e.external_status} /></td>
                    <td>{e.external_status || '-'}</td>
                  </tr>
                ))}
                {!events.length ? <tr><td colSpan={3}><div className="empty-state">Sem eventos para este embarque.</div></td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
