'use client';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';

export function ShipmentsList() {
  const { data, loading, error } = useApi(() => api('/shipments'), []);
  return (
    <div className="card">
      <h2>Embarques</h2>
      {loading && <p>Carregando...</p>}
      {error && <p>{error}</p>}
      <table>
        <thead><tr><th>Pedido</th><th>Transportadora</th><th>Status</th><th>Data criação</th></tr></thead>
        <tbody>
          {(data as any)?.items?.map((s: any) => (
            <tr key={s.id}>
              <td><Link href={`/shipments/${s.id}`}>{s.order_id}</Link></td>
              <td>{s.carrier_name || '-'}</td>
              <td>{s.status}</td>
              <td>{new Date(s.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
