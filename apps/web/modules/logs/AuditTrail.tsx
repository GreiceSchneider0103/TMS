'use client';
import { useMemo, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { downloadCsv } from '@/services/csv';
import { eventLabel, formatDateTime, summarizeData } from '@/services/format';

export default function AuditPage() {
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [date, setDate] = useState('');
  const { data, loading, error, reload } = useApi(() => api('/logs/audit?limit=200'), []);

  const items: any[] = useMemo(() => (data as any)?.items || [], [data]);
  const entities = useMemo(() => Array.from(new Set(items.map((r) => r.entity))).sort(), [items]);
  const actions = useMemo(() => Array.from(new Set(items.map((r) => r.action))).sort(), [items]);

  const filtered = items.filter((r) => {
    if (entityFilter !== 'all' && r.entity !== entityFilter) return false;
    if (actionFilter !== 'all' && r.action !== actionFilter) return false;
    if (date && !String(r.created_at || '').startsWith(date)) return false;
    return true;
  });

  function exportCsv() {
    downloadCsv('auditoria.csv', filtered.map((r) => ({
      'Data/hora': formatDateTime(r.created_at),
      Ação: eventLabel(r.action),
      Registro: eventLabel(r.entity),
      Detalhes: summarizeData(r.after_data || r.before_data)
    })));
  }

  return (
    <div className="grid">
      <PageHeader
        title="Auditoria"
        subtitle="Registro das ações realizadas no sistema"
        actions={<button className="btn" disabled={!filtered.length} onClick={exportCsv}><Icon name="download" />Exportar</button>}
      />
      <Panel title="Eventos" subtitle={loading ? undefined : `${filtered.length} evento(s)`} right={<button className="btn sm" onClick={reload}><Icon name="refresh" />Atualizar</button>}>
        <div className="filter-row">
          <Field label="Registro">
            <select className="select" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="all">Todos</option>
              {entities.map((e) => <option key={e} value={e}>{eventLabel(e)}</option>)}
            </select>
          </Field>
          <Field label="Ação">
            <select className="select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">Todas</option>
              {actions.map((a) => <option key={a} value={a}>{eventLabel(a)}</option>)}
            </select>
          </Field>
          <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>

        {loading ? <LoadingState text="Carregando auditoria..." /> : error ? <ErrorState text={error} /> : filtered.length === 0 ? <EmptyState text="Nenhum evento encontrado." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data/hora</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{formatDateTime(r.created_at)}</td>
                    <td>{eventLabel(r.action)}</td>
                    <td>{eventLabel(r.entity)}</td>
                    <td className="muted">{summarizeData(r.after_data || r.before_data)}</td>
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
