'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { eventLabel, formatDateTime, statusInfo } from '@/services/format';

// Agrupa os status técnicos em três situações que fazem sentido para o operador.
function bucket(status: unknown): 'ok' | 'pending' | 'error' {
  const tone = statusInfo(status).tone;
  if (tone === 'error') return 'error';
  if (tone === 'success' || tone === 'info') return 'ok';
  return 'pending';
}

export default function LogsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const sync = useApi(() => api('/logs/sync?limit=100'), []);
  const hooks = useApi(() => api('/logs/webhooks?limit=100'), []);

  const syncItems: any[] = (sync.data as any)?.items || [];
  const hookItems: any[] = (hooks.data as any)?.items || [];
  const all = [...syncItems, ...hookItems];
  const count = (b: string) => all.filter((x) => bucket(x.status) === b).length;
  const matches = (r: any) => statusFilter === 'all' || bucket(r.status) === statusFilter;

  const refresh = () => { sync.reload(); hooks.reload(); };

  return (
    <div className="grid">
      <PageHeader title="Histórico de integrações" subtitle="Sincronizações com ERP e notificações recebidas dos marketplaces" actions={<button className="btn" onClick={refresh}><Icon name="refresh" />Atualizar</button>} />

      <div className="kpi-grid">
        <StatCard title="Total de registros" value={all.length} />
        <StatCard title="Concluídos" value={count('ok')} tone="success" />
        <StatCard title="Pendentes" value={count('pending')} tone="warning" />
        <StatCard title="Com erro" value={count('error')} tone="error" />
      </div>

      <Panel title="Sincronizações" subtitle="Importação de pedidos e atualização de status" right={
        <Field label="Situação">
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todas</option>
            <option value="ok">Concluídas</option>
            <option value="pending">Pendentes</option>
            <option value="error">Com erro</option>
          </select>
        </Field>
      }>
        {sync.loading ? <LoadingState /> : sync.error ? <ErrorState text={sync.error} /> : (
          <LogTable rows={syncItems.filter(matches)} label={(r) => eventLabel(r.kind)} />
        )}
      </Panel>

      <Panel title="Notificações recebidas" subtitle="Pedidos de cotação e eventos enviados pelos marketplaces e pelo ERP">
        {hooks.loading ? <LoadingState /> : hooks.error ? <ErrorState text={hooks.error} /> : (
          <LogTable rows={hookItems.filter(matches)} label={(r) => eventLabel(r.provider)} />
        )}
      </Panel>
    </div>
  );
}

function LogTable({ rows, label }: { rows: any[]; label: (r: any) => string }) {
  if (!rows.length) return <EmptyState text="Nenhum registro." />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Origem</th><th>Situação</th><th>Observação</th><th>Data/hora</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{label(r)}</td>
              <td><StatusBadge status={r.status} /></td>
              <td className="muted">{r.error ? 'Falha no processamento — verifique a integração.' : '-'}</td>
              <td className="nowrap">{formatDateTime(r.updated_at || r.received_at || r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
