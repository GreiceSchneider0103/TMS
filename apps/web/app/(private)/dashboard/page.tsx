'use client';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { eventLabel, formatDateTime, formatMoney, formatNumber } from '@/services/format';

export default function DashboardPage() {
  const summary = useApi(() => api('/dashboard/summary'), []);
  const sync = useApi(() => api('/logs/sync?limit=8'), []);

  const s = (summary.data as any) || {};
  const byCarrier: any[] = s.byCarrier || [];
  const jobs: any[] = (sync.data as any)?.items || [];

  return (
    <div className="grid">
      <PageHeader title="Painel" subtitle="Visão geral da operação de transportes" />

      {summary.error ? <ErrorState text={summary.error} /> : null}

      <div className="kpi-grid">
        <StatCard title="Pedidos" value={formatNumber(s.orders_total ?? 0)} />
        <StatCard title="Aguardando cotação" value={formatNumber(s.pending_quote ?? 0)} tone="warning" />
        <StatCard title="Despachados" value={formatNumber(s.pending_dispatch ?? 0)} tone="info" />
        <StatCard title="Em trânsito" value={formatNumber(s.in_transit ?? 0)} tone="info" />
        <StatCard title="Entregues" value={formatNumber(s.delivered ?? 0)} tone="success" />
        <StatCard title="Ocorrências" value={formatNumber(s.exceptions ?? 0)} tone="error" />
        <StatCard title="Atrasados (+10 dias)" value={formatNumber(s.delayed ?? 0)} tone="warning" />
        <StatCard title="Valor dos pedidos" value={formatMoney(s.freight_revenue ?? 0)} />
      </div>

      <div className="two-col">
        <Panel title="Desempenho por transportadora" subtitle="Embarques, prazo médio e custo de frete">
          {summary.loading ? <LoadingState /> : byCarrier.length === 0 ? <EmptyState text="Nenhum embarque registrado ainda." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Transportadora</th><th className="text-right">Embarques</th><th className="text-right">Prazo médio</th><th className="text-right">Custo de frete</th></tr></thead>
                <tbody>
                  {byCarrier.map((c, i) => (
                    <tr key={c.carrier || i}>
                      <td>{c.carrier || 'Sem transportadora'}</td>
                      <td className="text-right">{formatNumber(c.shipments)}</td>
                      <td className="text-right">{c.avg_sla_days ? `${Math.round(Number(c.avg_sla_days))} dias` : '-'}</td>
                      <td className="text-right">{formatMoney(c.freight_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Últimas sincronizações" subtitle="Integrações com ERP e marketplaces" right={<Link className="btn ghost sm" href="/logs?tab=integracoes">Ver histórico</Link>}>
          {sync.loading ? <LoadingState /> : sync.error ? <EmptyState text="Histórico indisponível para o seu perfil de acesso." /> : jobs.length === 0 ? <EmptyState text="Nenhuma sincronização recente." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Integração</th><th>Situação</th><th>Quando</th></tr></thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>{eventLabel(job.kind)}</td>
                      <td><StatusBadge status={job.status} /></td>
                      <td className="nowrap">{formatDateTime(job.updated_at || job.created_at)}</td>
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
