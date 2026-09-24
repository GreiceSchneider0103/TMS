'use client';
import Link from 'next/link';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { channelLabel, formatCep, formatDateTime, formatMoney, formatNumber } from '@/services/format';

export function OrderDetail({ id }: { id: string }) {
  const { data, loading, error } = useApi(() => api(`/orders/${id}`), [id]);

  if (loading) return <LoadingState text="Carregando pedido..." />;
  if (error) return <ErrorState text={error} />;

  const order = (data as any) || {};
  const items: any[] = order.items || [];
  const shipments: any[] = order.shipments || [];
  const p = order.raw_payload || {};
  const skus: string[] = Array.isArray(p.skus) ? p.skus : [];
  const dims = [p.length_cm, p.width_cm, p.height_cm].every((v) => v !== undefined && v !== null) ? `${p.length_cm} × ${p.width_cm} × ${p.height_cm} cm` : '-';
  const place = [p.city, p.state].filter(Boolean).join(' / ');

  return (
    <div className="grid">
      <PageHeader
        title={`Pedido #${order.order_number || order.external_id || ''}`}
        subtitle={`${channelLabel(order.channel)} · criado em ${formatDateTime(order.created_at)}`}
        actions={
          <>
            <Link className="btn" href="/orders"><Icon name="back" />Voltar</Link>
            {!shipments.length ? <Link className="btn primary" href={`/quotes?orderId=${order.id}`}>Cotar frete</Link> : null}
          </>
        }
      />

      <Panel title="Dados gerais">
        <div className="detail-grid">
          <div className="detail-item"><small>Situação</small><StatusBadge status={order.status} /></div>
          <div className="detail-item"><small>Canal de venda</small><strong>{channelLabel(order.channel)}</strong></div>
          <div className="detail-item"><small>Valor do pedido</small><strong>{formatMoney(order.total_amount)}</strong></div>
          <div className="detail-item"><small>Valor da nota fiscal</small><strong>{formatMoney(order.invoice_amount ?? order.total_amount)}</strong></div>
          {order.shipping_amount != null ? <div className="detail-item"><small>Frete cobrado</small><strong>{formatMoney(order.shipping_amount)}</strong></div> : null}
          <div className="detail-item"><small>Código no canal</small><strong>{order.external_id || '-'}</strong></div>
          <div className="detail-item"><small>Última atualização</small><strong>{formatDateTime(order.updated_at)}</strong></div>
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="Entrega">
          <div className="detail-grid">
            <div className="detail-item"><small>CEP de destino</small><strong>{formatCep(p.postal_code)}</strong></div>
            <div className="detail-item"><small>Cidade / UF</small><strong>{place || '-'}</strong></div>
            <div className="detail-item"><small>Tipo de destinatário</small><strong>{p.recipient_type === 'PJ' ? 'Pessoa jurídica' : p.recipient_type === 'PF' ? 'Pessoa física' : '-'}</strong></div>
            <div className="detail-item"><small>Peso</small><strong>{p.weight_kg != null ? `${formatNumber(p.weight_kg)} kg` : '-'}</strong></div>
            <div className="detail-item"><small>Dimensões (C × L × A)</small><strong>{dims}</strong></div>
          </div>
        </Panel>

        <Panel title="Embarques" subtitle={shipments.length ? undefined : 'Pedido ainda não despachado'}>
          {shipments.length === 0 ? <EmptyState text="Nenhum embarque para este pedido." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Transportadora</th><th>Rastreio</th><th>Situação</th><th></th></tr></thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr key={s.id}>
                      <td>{s.carrier_name || '-'}</td>
                      <td>{s.tracking_code || '-'}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="text-right"><Link className="btn ghost sm" href={`/shipments/${s.id}`}>Ver</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Itens do pedido">
        {items.length === 0 && skus.length === 0 ? <EmptyState text="Pedido sem itens vinculados." /> : items.length === 0 ? (
          <div className="chips">{skus.map((sku) => <span key={sku} className="badge neutral">{sku}</span>)}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th className="text-right">Quantidade</th><th className="text-right">Preço unitário</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id || `${item.sku}-${item.qty}`}>
                    <td>{item.sku || '-'}</td>
                    <td className="text-right">{item.qty ?? '-'}</td>
                    <td className="text-right">{formatMoney(item.unit_price)}</td>
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
