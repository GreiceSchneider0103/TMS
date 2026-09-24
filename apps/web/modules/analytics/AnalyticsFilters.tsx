'use client';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { Field } from '@/components/ui/Field';
import { CHANNEL_OPTIONS, UF_OPTIONS } from '@/services/brazil';

export type AnalyticsFilterState = { days: string; from: string; to: string; state: string; channel: string; carrierId: string };
export const DEFAULT_FILTERS: AnalyticsFilterState = { days: '30', from: '', to: '', state: '', channel: '', carrierId: '' };

export function filtersToQuery(f: AnalyticsFilterState) {
  const q: Record<string, string> = {};
  if (f.days === 'custom') { if (f.from) q.from = f.from; if (f.to) q.to = f.to; } else q.days = f.days;
  if (f.state) q.state = f.state;
  if (f.channel) q.channel = f.channel;
  if (f.carrierId) q.carrierId = f.carrierId;
  return new URLSearchParams(q).toString();
}

// Filtros em uma linha acima dos gráficos (período pela data da venda, UF, canal, transportadora).
export function AnalyticsFilters({ value, onChange }: { value: AnalyticsFilterState; onChange: (v: AnalyticsFilterState) => void }) {
  const carriers = useApi(() => api('/carriers'), []);
  const set = (k: keyof AnalyticsFilterState, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="filter-row" style={{ marginBottom: 0 }}>
      <Field label="Período (data da venda)">
        <select className="select" value={value.days} onChange={(e) => set('days', e.target.value)}>
          <option value="7">Últimos 7 dias</option><option value="15">Últimos 15 dias</option><option value="30">Últimos 30 dias</option>
          <option value="60">Últimos 60 dias</option><option value="90">Últimos 90 dias</option><option value="custom">Personalizado</option>
        </select>
      </Field>
      {value.days === 'custom' ? (
        <>
          <Field label="De"><input className="input" type="date" value={value.from} onChange={(e) => set('from', e.target.value)} /></Field>
          <Field label="Até"><input className="input" type="date" value={value.to} onChange={(e) => set('to', e.target.value)} /></Field>
        </>
      ) : null}
      <Field label="Estado">
        <select className="select" value={value.state} onChange={(e) => set('state', e.target.value)}>
          <option value="">Todos</option>{UF_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </Field>
      <Field label="Canal">
        <select className="select" value={value.channel} onChange={(e) => set('channel', e.target.value)}>
          <option value="">Todos</option>{CHANNEL_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Transportadora">
        <select className="select" value={value.carrierId} onChange={(e) => set('carrierId', e.target.value)}>
          <option value="">Todas</option>{((carriers.data as any)?.items || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
    </div>
  );
}
