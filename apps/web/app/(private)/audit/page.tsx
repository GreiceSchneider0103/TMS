'use client';
import { useMemo, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { downloadCsv } from '@/services/csv';

export default function AuditPage() {
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [date, setDate] = useState('');
  const { data, loading, error } = useApi(() => api('/logs/audit?limit=200'), []);

  const items = (data as any)?.items || [];

  const entities = useMemo(() => Array.from(new Set(items.map((r: any) => r.entity))).sort(), [items]);
  const actions = useMemo(() => Array.from(new Set(items.map((r: any) => r.action))).sort(), [items]);

  const filtered = items.filter((r: any) => {
    if (entityFilter !== 'all' && r.entity !== entityFilter) return false;
    if (actionFilter !== 'all' && r.action !== actionFilter) return false;
    if (date && !String(r.created_at || '').startsWith(date)) return false;
    return true;
  });

  return (
    <div className="grid">
      <PageHeader
        title="Auditoria"
        subtitle="Registro completo de ações no sistema"
        actions={<button className="btn primary" onClick={() => downloadCsv('auditoria.csv', filtered)}>Exportar</button>}
      />
      <Panel title="Eventos de auditoria">
        <div className="filter-row">
          <span style={{ color: '#9fb0d8' }}>Filtros:</span>
          <select className="select" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="all">Todos os recursos</option>
            {entities.map((e: any) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">Todas as ações</option>
            {actions.map((a: any) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {loading ? <LoadingState text="Carregando auditoria..." /> : error ? <ErrorState text={error} /> : filtered.length === 0 ? <EmptyState /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data/Hora</th><th>Ação</th><th>Recurso</th><th>ID do recurso</th><th>Detalhes</th></tr></thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                    <td><StatusBadge status={r.action} /></td>
                    <td>{r.entity}</td>
                    <td className="mono">{String(r.entity_id || '-').slice(0, 8)}</td>
                    <td className="mono">{JSON.stringify(r.after_data || r.before_data || {}).slice(0, 80)}</td>
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
