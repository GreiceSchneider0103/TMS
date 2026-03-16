'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

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

  const items = (data as any)?.items || [];

  return (
    <div className="grid">
      <PageHeader
        title="Pedidos"
        subtitle="Gerencie todos os pedidos do sistema"
        actions={<button className="btn primary">Exportar</button>}
      />

      <Panel title="Lista de Pedidos" right={<button className="btn" onClick={() => setNonce((v) => v + 1)}>Atualizar</button>}>
        <div className="filter-row">
          <span style={{ color: '#9fb0d8' }}>Filtros:</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option>READY_FOR_QUOTE</option>
            <option>QUOTED</option>
            <option>DISPATCHED</option>
            <option>DELIVERED</option>
            <option>EXCEPTION</option>
          </select>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <input className="input" placeholder="Transportadora" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </div>

        {loading ? <p>Carregando pedidos...</p> : error ? <p className="text-error">{error}</p> : items.length === 0 ? <EmptyState /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>CEP</th>
                  <th>Transportadora</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o: any) => (
                  <tr key={o.id}>
                    <td className="mono">#{o.order_number || o.external_id || o.id.slice(0, 8)}</td>
                    <td>{o.recipient_name || o.customer_name || 'Cliente não informado'}</td>
                    <td>{o.destination_postal_code || '-'}</td>
                    <td>{o.carrier_name || '-'}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td>{o.created_at ? new Date(o.created_at).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn ghost" href={`/orders/${o.id}`}>Ver</Link>
                        <button className="btn ghost">Cotação</button>
                        <button className="btn primary">Despachar</button>
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
