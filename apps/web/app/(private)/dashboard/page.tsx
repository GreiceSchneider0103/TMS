'use client';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

export default function DashboardPage() {
  const summary = useApi(() => api('/dashboard/summary'), []);
  const sync = useApi(() => api('/logs/sync?limit=8'), []);

  const items = (sync.data as any)?.items || [];

  return (
    <div className="grid">
      <PageHeader title="Dashboard" subtitle="Visão operacional do TMS" />

      <div className="kpi-grid">
        <StatCard title="Pedidos" value={(summary.data as any)?.orders_total ?? 0} />
        <StatCard title="Pendentes de despacho" value={(summary.data as any)?.pending_dispatch ?? 0} tone="warning" />
        <StatCard title="Exceções" value={(summary.data as any)?.exceptions ?? 0} tone="error" />
        <StatCard title="Em trânsito" value={(summary.data as any)?.in_transit ?? 0} tone="info" />
      </div>

      <div className="two-col">
        <Panel title="Resumo operacional" subtitle="Indicadores do período atual">
          {summary.loading ? <LoadingState text="Carregando resumo operacional..." /> : summary.error ? <ErrorState text={summary.error} /> : (
            <div className="detail-grid">
              {Object.entries((summary.data as any) || {}).map(([key, value]) => (
                <div className="detail-item" key={key}>
                  <small>{key}</small>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Jobs recentes" subtitle="Sincronização e integrações">
          {sync.loading ? <LoadingState text="Carregando jobs..." /> : sync.error ? <ErrorState text={sync.error} /> : items.length === 0 ? <EmptyState text="Sem jobs recentes." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Tipo</th><th>Status</th><th>Atualizado</th></tr></thead>
                <tbody>
                  {items.map((job: any) => (
                    <tr key={job.id}>
                      <td>{job.kind}</td>
                      <td><StatusBadge status={job.status} /></td>
                      <td>{job.updated_at ? new Date(job.updated_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
