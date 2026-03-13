'use client';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { JsonView } from '@/components/JsonView';

export function OrderDetail({ id }: { id: string }) {
  const { data, loading, error } = useApi(() => api(`/orders/${id}`), [id]);
  if (loading) return <p>Carregando...</p>;
  if (error) return <p>{error}</p>;
  return (
    <div className="grid">
      <div className="card"><h2>Dados do pedido</h2><JsonView data={data} /></div>
      <div className="card"><h2>Itens</h2><JsonView data={(data as any)?.items || []} /></div>
      <div className="card"><h2>Timeline</h2><JsonView data={(data as any)?.timeline || (data as any)?.events || []} /></div>
    </div>
  );
}
