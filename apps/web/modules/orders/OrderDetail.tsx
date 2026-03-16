'use client';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

export function OrderDetail({ id }: { id: string }) {
  const { data, loading, error } = useApi(() => api(`/orders/${id}`), [id]);

  if (loading) return <p>Carregando pedido...</p>;
  if (error) return <p className="text-error">{error}</p>;

  const order = (data as any) || {};
  const items = order.items || [];

  return (
    <div className="grid">
      <PageHeader title={`Pedido #${order.order_number || id.slice(0, 8)}`} subtitle="Detalhamento operacional do pedido" />

      <Panel title="Dados gerais">
        <div className="detail-grid">
          <div className="detail-item"><small>Status</small><StatusBadge status={order.status} /></div>
          <div className="detail-item"><small>Canal</small><strong>{order.channel || '-'}</strong></div>
          <div className="detail-item"><small>Total</small><strong>R$ {Number(order.total_amount || 0).toFixed(2)}</strong></div>
          <div className="detail-item"><small>Invoice</small><strong>R$ {Number(order.invoice_amount || 0).toFixed(2)}</strong></div>
          <div className="detail-item"><small>Criado em</small><strong>{order.created_at ? new Date(order.created_at).toLocaleString() : '-'}</strong></div>
          <div className="detail-item"><small>External ID</small><strong className="mono">{order.external_id || '-'}</strong></div>
        </div>
      </Panel>

      <Panel title="Itens do pedido">
        {items.length === 0 ? <EmptyState text="Pedido sem itens vinculados." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Qtd</th><th>Preço Unitário</th></tr></thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id || `${item.sku}-${item.qty}`}>
                    <td>{item.sku || '-'}</td>
                    <td>{item.qty ?? '-'}</td>
                    <td>R$ {Number(item.unit_price || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Payload logístico">
        <pre className="mono" style={{ margin: 0 }}>{JSON.stringify(order.raw_payload || {}, null, 2)}</pre>
      </Panel>
    </div>
  );
}
