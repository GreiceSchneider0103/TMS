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

export default function LogsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const sync = useApi(() => api('/logs/sync?limit=50'), []);
  const hooks = useApi(() => api('/logs/webhooks?limit=50'), []);
  const audit = useApi(() => api('/logs/audit?limit=50'), []);

  const syncItems = (sync.data as any)?.items || [];
  const hookItems = (hooks.data as any)?.items || [];
  const errorCount = syncItems.filter((x: any) => String(x.status).toLowerCase().includes('error')).length;
  const retryCount = syncItems.filter((x: any) => String(x.status).toLowerCase().includes('retry')).length;

  const statusMatches = (v: string) => statusFilter === 'all' || String(v || '').toLowerCase().includes(statusFilter);

  return (
    <div className="grid">
      <PageHeader title="Logs" subtitle="Monitoramento técnico e depuração" actions={<button className="btn" onClick={() => location.reload()}>Atualizar</button>} />

      <div className="kpi-grid">
        <StatCard title="Requisições com sucesso" value={syncItems.length + hookItems.length} tone="success" />
        <StatCard title="Em retry" value={retryCount} tone="warning" />
        <StatCard title="Erros" value={errorCount} tone="error" />
        <StatCard title="Audit logs" value={(audit.data as any)?.items?.length || 0} />
      </div>

      <Panel title="Filtros">
        <div className="filter-row">
          <span style={{ color: '#9fb0d8' }}>Status:</span>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="retry">Retry</option>
          </select>
        </div>
      </Panel>

      <Panel title="sync_jobs">
        {sync.loading ? <LoadingState /> : sync.error ? <ErrorState text={sync.error} /> : <LogTable rows={syncItems.filter((r: any) => statusMatches(r.status))} type="sync" />}
      </Panel>
      <Panel title="webhook_logs">
        {hooks.loading ? <LoadingState /> : hooks.error ? <ErrorState text={hooks.error} /> : <LogTable rows={hookItems.filter((r: any) => statusMatches(r.status))} type="webhook" />}
      </Panel>
      <Panel title="audit_logs">
        {audit.loading ? <LoadingState /> : audit.error ? <ErrorState text={audit.error} /> : <LogTable rows={(audit.data as any)?.items || []} type="audit" />}
      </Panel>
    </div>
  );
}

function LogTable({ rows, type }: { rows: any[]; type: 'sync' | 'webhook' | 'audit' }) {
  if (!rows.length) return <div className="empty-state">Sem registros.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Tipo</th><th>Status</th><th>Payload</th><th>Erro</th><th>Data/Hora</th></tr></thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td className="mono">{String(r.id).slice(0, 8)}</td>
              <td>{type === 'sync' ? r.kind : type === 'webhook' ? r.provider : r.action}</td>
              <td><StatusBadge status={r.status || r.action || 'ok'} /></td>
              <td className="mono">{type === 'audit' ? r.entity : JSON.stringify(r.payload || {}).slice(0, 64) || '-'}</td>
              <td>{r.error || '-'}</td>
              <td>{(r.updated_at || r.created_at) ? new Date(r.updated_at || r.created_at).toLocaleString() : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
