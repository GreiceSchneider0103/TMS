'use client';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { JsonView } from '@/components/JsonView';

export function ShipmentDetail({ id }: { id: string }) {
  const { data, loading, error } = useApi(() => api(`/shipments/${id}`), [id]);
  const tracking = useApi(() => api(`/tracking/shipment/${id}`), [id]);

  if (loading) return <p>Carregando...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="grid">
      <div className="card"><h2>Dados do embarque</h2><JsonView data={data} /></div>
      <div className="card"><h2>Timeline</h2><JsonView data={(data as any)?.events || []} /></div>
      <div className="card"><h2>Tracking</h2>{tracking.loading ? <p>Carregando...</p> : <JsonView data={tracking.data || tracking.error} />}</div>
    </div>
  );
}
