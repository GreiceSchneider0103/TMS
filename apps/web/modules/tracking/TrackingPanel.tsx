'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { formatDateTime, statusInfo } from '@/services/format';

export function TrackingPanel() {
  const shipments = useApi(() => api('/shipments'), []);
  const [selected, setSelected] = useState<string>('');
  const timeline = useApi(() => selected ? api(`/tracking/shipment/${selected}`) : Promise.resolve({ items: [] } as any), [selected]);

  const shipmentItems: any[] = (shipments.data as any)?.items || [];
  const events: any[] = (timeline.data as any)?.items || [];
  const current = shipmentItems.find((s) => s.id === selected);

  return (
    <div className="grid">
      <PageHeader title="Rastreamento" subtitle="Acompanhe a entrega dos pedidos despachados" />

      <Panel title="Embarque">
        {shipments.loading ? <LoadingState text="Carregando embarques..." /> : shipments.error ? <ErrorState text={shipments.error} /> : shipmentItems.length === 0 ? <EmptyState text="Nenhum embarque para rastrear." /> : (
          <div className="filter-row">
            <Field label="Selecione o embarque" className="grow">
              <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Escolha um embarque...</option>
                {shipmentItems.map((s) => (
                  <option key={s.id} value={s.id}>Pedido #{s.order_number || '-'} · {s.carrier_name || '-'} · {s.tracking_code || 'sem rastreio'} · {statusInfo(s.status).label}</option>
                ))}
              </select>
            </Field>
            <button className="btn" disabled={!selected} onClick={timeline.reload}><Icon name="refresh" />Atualizar</button>
            {current ? <Link className="btn ghost" href={`/shipments/${current.id}`}>Detalhes do embarque</Link> : null}
          </div>
        )}
      </Panel>

      <Panel title="Histórico de eventos">
        {!selected ? <EmptyState text="Selecione um embarque para ver o histórico." /> : timeline.loading ? <LoadingState text="Carregando histórico..." /> : timeline.error ? <ErrorState text={timeline.error} /> : events.length === 0 ? <EmptyState text="Nenhum evento de rastreio recebido para este embarque." /> : (
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <strong>{e.external_status || statusInfo(e.macro_status).label}</strong>
                <span className="muted small">{formatDateTime(e.occurred_at)} · </span><StatusBadge status={e.macro_status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
