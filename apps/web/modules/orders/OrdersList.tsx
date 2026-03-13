'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';

export function OrdersList() {
  const [status, setStatus] = useState('');
  const [carrier, setCarrier] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useApi(
    () => api(`/orders?status=${status}&carrier=${carrier}&from=${from}&to=${to}&limit=100`),
    [status, carrier, from, to, nonce]
  );

  return (
    <div className="card">
      <h2>Pedidos</h2>
      <div className="row">
        <input placeholder="status" value={status} onChange={(e) => setStatus(e.target.value)} />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <input placeholder="transportadora" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        <button onClick={() => setNonce((s) => s + 1)}>Atualizar</button>
      </div>
      {loading && <p>Carregando...</p>}
      {error && <p>{error}</p>}
      <table>
        <thead><tr><th>ID</th><th>Cliente</th><th>Status</th><th>Transportadora</th><th>Data</th></tr></thead>
        <tbody>
          {(data as any)?.items?.map((o: any) => (
            <tr key={o.id}>
              <td><Link href={`/orders/${o.id}`}>{o.id}</Link></td>
              <td>{o.recipient_name || o.customer_name || '-'}</td>
              <td>{o.status}</td>
              <td>{o.carrier_name || '-'}</td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
