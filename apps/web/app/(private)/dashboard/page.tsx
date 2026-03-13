'use client';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { JsonView } from '@/components/JsonView';

export default function DashboardPage() {
  const summary = useApi(() => api('/dashboard/summary'), []);
  const sync = useApi(() => api('/logs/sync?limit=20'), []);

  return (
    <div className="grid">
      <h1>Dashboard operacional</h1>
      <div className="grid kpi">
        <Kpi title="Pedidos importados" value={(summary.data as any)?.orders_total} />
        <Kpi title="Embarques criados" value={(summary.data as any)?.pending_dispatch} />
        <Kpi title="Erros recentes" value={(summary.data as any)?.exceptions} />
        <Kpi title="Jobs sincronização" value={(sync.data as any)?.items?.length} />
        <Kpi title="Último sync Tiny" value={(sync.data as any)?.items?.[0]?.updated_at || '-'} />
      </div>
      <div className="card"><h3>Resumo API</h3>{summary.loading ? 'Carregando...' : <JsonView data={summary.data || summary.error} />}</div>
      <div className="card"><h3>Jobs de sync recentes</h3>{sync.loading ? 'Carregando...' : <JsonView data={(sync.data as any)?.items || sync.error} />}</div>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: any }) {
  return <div className="card"><small>{title}</small><h2>{String(value ?? 0)}</h2></div>;
}
