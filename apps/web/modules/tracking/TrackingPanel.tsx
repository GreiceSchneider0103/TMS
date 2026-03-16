'use client';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { JsonView } from '@/components/JsonView';

export function TrackingPanel() {
  const { data, loading, error } = useApi(() => api('/shipments'), []);
  return (
    <div className="card">
      <h2>Tracking operacional</h2>
      {loading && <p>Carregando...</p>}
      {error && <p>{error}</p>}
      {(data as any)?.items?.slice(0, 30).map((s: any) => (
        <details key={s.id} className="card">
          <summary>{s.tracking_code || s.id} - {s.status}</summary>
          <TrackingEvents shipmentId={s.id} />
        </details>
      ))}
    </div>
  );
}

function TrackingEvents({ shipmentId }: { shipmentId: string }) {
  const { data, loading, error } = useApi(() => api(`/tracking/shipment/${shipmentId}`), [shipmentId]);
  if (loading) return <p>Carregando eventos...</p>;
  if (error) return <p>{error}</p>;
  return <JsonView data={data} />;
}
