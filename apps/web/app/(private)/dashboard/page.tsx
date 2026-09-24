'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { BarChart } from '@/components/charts/BarChart';
import { UfTileMap } from '@/components/charts/UfTileMap';
import { AnalyticsFilters, DEFAULT_FILTERS, filtersToQuery } from '@/modules/analytics/AnalyticsFilters';
import { DrillModal } from '@/modules/analytics/DrillModal';
import type { DrillColumn } from '@/modules/analytics/DrillModal';
import { channelLabel, formatDate, formatNumber, statusInfo } from '@/services/format';

// Tom de cada indicador: good = bom sinal, bad = problema, warn = atenção.
const TONES: Record<string, string> = {
  total: 'neutral', aguardando_envio: 'warn', expedicao_atrasada: 'bad', sem_nf: 'warn', em_andamento: 'info', entregues: 'good',
  atraso_transporte_entregues: 'bad', atraso_transporte_abertos: 'bad', atraso_pedido_entregues: 'bad', atraso_pedido_abertos: 'bad',
  previsao_atraso: 'warn', ocorrencias: 'bad', avaria: 'bad', extravio: 'bad', roubo: 'bad', tentativa: 'warn', devolvidos: 'bad', cancelados: 'neutral'
};
const GROUPS: [string, string[]][] = [
  ['Pedidos', ['total', 'aguardando_envio', 'expedicao_atrasada', 'sem_nf', 'em_andamento', 'entregues']],
  ['Prazos', ['atraso_transporte_entregues', 'atraso_transporte_abertos', 'atraso_pedido_entregues', 'atraso_pedido_abertos', 'previsao_atraso']],
  ['Ocorrências', ['ocorrencias', 'avaria', 'extravio', 'roubo', 'tentativa', 'devolvidos', 'cancelados']]
];

const d = (v: any) => (v ? formatDate(String(v).length === 10 ? `${v}T12:00:00` : v) : '-');
const DRILL_COLUMNS: DrillColumn[] = [
  { label: 'Pedido', value: (r) => `#${r.order_number}`, csv: (r) => r.order_number },
  { label: 'Canal', value: (r) => channelLabel(r.channel) },
  { label: 'UF', value: (r) => r.uf || '-' },
  { label: 'Transportadora', value: (r) => r.carrier_name || '-' },
  { label: 'Situação', value: (r) => statusInfo(r.status).label },
  { label: 'Venda', value: (r) => d(r.sold_at) },
  { label: 'Postar até', value: (r) => d(r.ship_by_date) },
  { label: 'Previsão', value: (r) => d(r.estimated_delivery_date) },
  { label: 'Prometido', value: (r) => d(r.promised_delivery_date) },
  { label: 'Entregue', value: (r) => d(r.delivered_at) },
  { label: 'Ocorrência', value: (r) => r.exception_text || '-' }
];

const weekday = (iso: string) => {
  const dt = new Date(`${iso}T12:00:00`);
  return <>{dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}<br />{dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</>;
};

export default function ControlTowerPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [drill, setDrill] = useState<{ key: string; label: string } | null>(null);
  const qs = filtersToQuery(filters);
  const { data, loading, error, reload } = useApi(() => api(`/analytics/control-tower?${qs}`), [qs]);
  const t = (data as any) || null;
  const counts: Record<string, number> = t?.counts || {};
  const labels: Record<string, string> = Object.fromEntries((t?.cards || []).map((c: any) => [c.key, c.label]));
  const total = counts.total || 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid">
      <PageHeader title="Torre de controle" subtitle="Acompanhamento de expedição, entregas, prazos e ocorrências" actions={<button className="btn" onClick={reload}><Icon name="refresh" />Atualizar</button>} />

      <Panel title="Filtros"><AnalyticsFilters value={filters} onChange={setFilters} /></Panel>

      {error ? <ErrorState text={error} /> : !t ? <LoadingState text="Calculando indicadores..." /> : (
        <>
          {counts.pendencias ? (
            <div className="notice warn">{counts.pendencias} pendência(s) de integração em aberto (pedidos parados por CEP inválido, transportadora sem de-para ou destino sem tabela). <Link href="/logs?tab=pendencias" style={{ textDecoration: 'underline' }}>Ver pendências</Link></div>
          ) : null}

          {GROUPS.map(([title, keys]) => (
            <section key={title} className="grid" style={{ gap: 8 }}>
              <h3 className="muted" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</h3>
              <div className="tower-grid">
                {keys.map((k) => {
                  const n = counts[k] || 0;
                  const pct = total && k !== 'total' ? (n / total) * 100 : k === 'total' ? 100 : 0;
                  const tone = n === 0 && TONES[k] !== 'good' ? 'neutral' : TONES[k];
                  return (
                    <button key={k} type="button" className={`tower-card ${tone}`} onClick={() => setDrill({ key: k, label: labels[k] || k })} title="Ver pedidos">
                      <small>{labels[k] || k}</small>
                      <strong>{formatNumber(n)}</strong>
                      <span className="pct">{pct.toFixed(1).replace('.', ',')}% do total</span>
                      <div className="meter"><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="two-col">
            {[['Entregas pela previsão da transportadora', t.deliveriesTransport], ['Entregas pela data prometida ao cliente', t.deliveriesPromised]].map(([title, rows]: any) => (
              <Panel key={title} title={title}>
                <div className="table-wrap">
                  <table className="day-table">
                    <thead><tr><th></th>{rows.map((r: any) => <th key={r.date} className={`text-right ${r.date === today ? 'today' : ''}`}>{weekday(r.date)}</th>)}</tr></thead>
                    <tbody>
                      {[['Total', 'total'], ['Entregues', 'delivered'], ['A entregar', 'pending']].map(([l, f]) => (
                        <tr key={f}><td>{l}</td>{rows.map((r: any) => <td key={r.date} className={`text-right ${r.date === today ? 'today' : ''}`}>{r[f]}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ))}
          </div>

          <div className="two-col">
            <Panel title="Pedidos a expedir" subtitle="Pelo prazo de postagem do canal">
              <div className="table-wrap">
                <table className="day-table">
                  <thead><tr><th className="text-right">Atrasados</th>{t.toShip.byDay.map((r: any) => <th key={r.date} className={`text-right ${r.date === today ? 'today' : ''}`}>{weekday(r.date)}</th>)}</tr></thead>
                  <tbody><tr><td className="text-right" style={{ color: t.toShip.late ? 'var(--red)' : undefined, fontWeight: 600 }}>{t.toShip.late}</td>{t.toShip.byDay.map((r: any) => <td key={r.date} className={`text-right ${r.date === today ? 'today' : ''}`}>{r.count}</td>)}</tr></tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Média de dias para expedir">
              <div style={{ textAlign: 'center', padding: '28px 0' }}>
                <strong style={{ fontSize: 44, color: 'var(--brand)' }}>{t.dispatchTime.average === null ? '-' : String(t.dispatchTime.average).replace('.', ',')}</strong>
                <div className="muted">dia(s) útil(eis) da venda ao despacho</div>
              </div>
            </Panel>
          </div>

          <div className="two-col">
            <Panel title="Tempo de expedição" subtitle="Dias úteis entre a venda e o despacho">
              {t.dispatchTime.buckets.every((b: any) => !b.count) ? <EmptyState text="Nenhum pedido despachado no período." /> : (
                <BarChart label="Tempo de expedição" data={t.dispatchTime.buckets.map((b: any) => ({ label: `${b.label} d`, value: b.count }))} format={(v) => `${v} pedido(s)`} />
              )}
            </Panel>
            <Panel title="Aguardando envio" subtitle="Dias úteis desde a venda">
              {t.waiting.buckets.every((b: any) => !b.count) ? <EmptyState text="Nenhum pedido aguardando envio." /> : (
                <BarChart label="Aguardando envio" data={t.waiting.buckets.map((b: any) => ({ label: `${b.label} d`, value: b.count }))} format={(v) => `${v} pedido(s)`} />
              )}
            </Panel>
          </div>

          <div className="two-col">
            <Panel title="Atraso de transporte por estado" subtitle="% dos pedidos despachados que estão ou chegaram atrasados">
              <UfTileMap
                values={Object.fromEntries(t.byState.map((s: any) => [s.key, s.latePct]))}
                format={(v) => `${String(Math.round(v * 10) / 10).replace('.', ',')}%`}
                metricLabel="% de atraso"
                selected={filters.state || null}
                onSelect={(uf) => setFilters({ ...filters, state: uf || '' })}
                detail={(uf) => { const s = t.byState.find((x: any) => x.key === uf); return s ? `${s.total} pedido(s), ${s.late} atrasado(s)` : null; }}
              />
            </Panel>
            <Panel title="Atraso por região">
              {t.byRegion.length === 0 ? <EmptyState /> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Região</th><th className="text-right">Pedidos</th><th className="text-right">Entregues</th><th className="text-right">Atrasados</th><th className="text-right">% atraso</th></tr></thead>
                    <tbody>
                      {t.byRegion.map((r: any) => (
                        <tr key={r.key}>
                          <td>{r.key}</td><td className="text-right">{r.total}</td><td className="text-right">{r.delivered}</td>
                          <td className="text-right">{r.late}</td><td className="text-right" style={{ color: r.latePct > 10 ? 'var(--red)' : undefined }}>{String(r.latePct).replace('.', ',')}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
          {loading ? <p className="muted small">Atualizando...</p> : null}
        </>
      )}

      {drill ? <DrillModal title={drill.label} url={`/analytics/control-tower/orders?card=${drill.key}&${qs}`} columns={DRILL_COLUMNS} fileName={`torre-${drill.key}.csv`} onClose={() => setDrill(null)} /> : null}
    </div>
  );
}
