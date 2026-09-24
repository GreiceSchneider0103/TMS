'use client';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { UfTileMap } from '@/components/charts/UfTileMap';
import { AnalyticsFilters, DEFAULT_FILTERS, filtersToQuery } from '@/modules/analytics/AnalyticsFilters';
import { DrillModal } from '@/modules/analytics/DrillModal';
import type { DrillColumn } from '@/modules/analytics/DrillModal';
import { downloadCsv } from '@/services/csv';
import { channelLabel, formatDate, formatMoney, formatNumber } from '@/services/format';

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${String(v).replace('.', ',')}%`);
const kg = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${formatNumber(Math.round(Number(v) * 100) / 100)} kg`);
const money = (v: number | null | undefined) => (v === null || v === undefined ? '-' : formatMoney(v));
const n2 = (v: number | null | undefined) => (v === null || v === undefined ? '' : Number(v).toFixed(2).replace('.', ','));

const DRILL: DrillColumn[] = [
  { label: 'Pedido', value: (r) => `#${r.order_number}`, csv: (r) => r.order_number },
  { label: 'Data', value: (r) => formatDate(r.sold_at) },
  { label: 'UF', value: (r) => r.uf || '-' },
  { label: 'Canal', value: (r) => channelLabel(r.channel) },
  { label: 'Valor NF', value: (r) => money(r.invoice_value), csv: (r) => n2(r.invoice_value), right: true },
  { label: 'Frete cobrado', value: (r) => money(r.charged), csv: (r) => n2(r.charged), right: true },
  { label: 'Custo (cotação)', value: (r) => money(r.cost), csv: (r) => n2(r.cost), right: true },
  { label: 'Lucro', value: (r) => money(r.profit), csv: (r) => n2(r.profit), right: true },
  { label: 'Pago (CT-e)', value: (r) => money(r.paid), csv: (r) => n2(r.paid), right: true },
  { label: 'Lucro (pago)', value: (r) => money(r.profit_paid), csv: (r) => n2(r.profit_paid), right: true },
  { label: 'Margem', value: (r) => pct(r.margin), csv: (r) => n2(r.margin), right: true },
  { label: 'Pago − cotado', value: (r) => money(r.difference), csv: (r) => n2(r.difference), right: true },
  { label: 'Kg calculado', value: (r) => kg(r.kg_calc), csv: (r) => n2(r.kg_calc), right: true },
  { label: 'Kg cobrado', value: (r) => kg(r.kg_charged), csv: (r) => n2(r.kg_charged), right: true }
];

const METRICS: Record<string, { label: string; get: (x: any) => number; format: (v: number) => string }> = {
  cost: { label: 'Custo de frete', get: (x) => x.sales.cost, format: (v) => formatMoney(v) },
  orders: { label: 'Pedidos', get: (x) => x.sales.orders, format: (v) => formatNumber(v) },
  expense: { label: '% de despesa sobre a NF', get: (x) => x.sales.expensePct || 0, format: (v) => pct(Math.round(v * 100) / 100) },
  charged: { label: 'Frete cobrado', get: (x) => x.sales.charged, format: (v) => formatMoney(v) }
};

function Block({ title, rows, subtitle }: { title: string; subtitle?: string; rows: [string, string, string?][] }) {
  return (
    <Panel title={title} subtitle={subtitle}>
      <div className="kpi-grid">
        {rows.map(([label, value, tone]) => (
          <div key={label} className={`stat-card ${tone || 'neutral'}`}><h4>{label}</h4><strong className="money-kpi">{value}</strong></div>
        ))}
      </div>
    </Panel>
  );
}

export default function FinancialPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [metric, setMetric] = useState('cost');
  const [drill, setDrill] = useState<{ title: string; params: string } | null>(null);
  const qs = filtersToQuery(filters);
  const { data, error, reload } = useApi(() => api(`/analytics/financial?${qs}`), [qs]);
  const fin = (data as any) || null;
  const s = fin?.totals?.sales;
  const a = fin?.totals?.audited;
  const profitTone = (v: number | null | undefined) => (v === null || v === undefined ? 'neutral' : v < 0 ? 'error' : 'success');
  const m = METRICS[metric];

  function exportCarriers() {
    downloadCsv('financeiro-transportadoras.csv', fin.byCarrier.map((c: any) => ({
      Transportadora: c.carrierName, Pedidos: c.sales.orders, 'Frete cobrado': n2(c.sales.charged), 'Custo (cotação)': n2(c.sales.cost), Lucro: n2(c.sales.profit),
      'Margem %': n2(c.sales.margin), 'Auditados': c.audited.orders, 'Pago (CT-e)': n2(c.audited.paid), 'Lucro (pago)': n2(c.audited.profit), 'Margem auditada %': n2(c.audited.margin),
      'Pago - cotado': n2(c.audited.difference), 'Valor NF': n2(c.sales.invoice), '% despesa': n2(c.sales.expensePct)
    })));
  }

  return (
    <div className="grid">
      <PageHeader title="Financeiro de frete" subtitle="Frete cobrado dos clientes × custo contratado × valor pago nos CT-es" actions={<button className="btn" onClick={reload}><Icon name="refresh" />Atualizar</button>} />
      <Panel title="Filtros"><AnalyticsFilters value={filters} onChange={setFilters} /></Panel>

      {error ? <ErrorState text={error} /> : !fin ? <LoadingState text="Calculando..." /> : (
        <>
          {s.orders && s.withCharge < s.orders ? (
            <div className="notice info">{s.orders - s.withCharge} de {s.orders} pedido(s) estão sem o valor de frete cobrado do cliente — lucro e margem consideram frete cobrado zero nesses casos. O valor pode ser informado em Pedido → Editar.</div>
          ) : null}

          <Block title={`Vendas · ${formatNumber(s.orders)} pedido(s)`} subtitle="Custo = valor contratado na cotação (ou informado no despacho manual)" rows={[
            ['Frete cobrado', money(s.charged)], ['Custo de frete', money(s.cost)], ['Lucro', money(s.profit), profitTone(s.profit)], ['Margem', pct(s.margin), profitTone(s.margin)],
            ['Valor das notas', money(s.invoice)], ['% de despesa sobre a NF', pct(s.expensePct)]
          ]} />
          <Block title={`Auditados · ${formatNumber(a.orders)} pedido(s) (${pct(a.pct)})`} subtitle="Pedidos com CT-e vinculado — custo = valor pago à transportadora" rows={[
            ['Frete cobrado', money(a.charged)], ['Custo pago (CT-e)', money(a.paid)], ['Lucro', money(a.profit), profitTone(a.profit)], ['Margem', pct(a.margin), profitTone(a.margin)],
            ['Pago − cotado', money(a.difference), a.difference > 0 ? 'error' : a.difference < 0 ? 'success' : 'neutral'], ['% de despesa sobre a NF', pct(a.expensePct)]
          ]} />

          <div className="two-col">
            <Panel title="Mapa por estado" right={
              <select className="select" style={{ width: 'auto', minHeight: 30 }} value={metric} onChange={(e) => setMetric(e.target.value)}>
                {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            }>
              {fin.byState.length === 0 ? <EmptyState text="Sem pedidos no período." /> : (
                <UfTileMap
                  values={Object.fromEntries(fin.byState.map((x: any) => [x.key, m.get(x)]))}
                  format={m.format}
                  metricLabel={m.label}
                  selected={filters.state || null}
                  onSelect={(uf) => setFilters({ ...filters, state: uf || '' })}
                  detail={(uf) => { const x = fin.byState.find((y: any) => y.key === uf); return x ? `${x.sales.orders} pedido(s) · margem ${pct(x.sales.margin)}` : null; }}
                />
              )}
            </Panel>
            <Panel title="Por estado">
              {fin.byState.length === 0 ? <EmptyState /> : (
                <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <table>
                    <thead><tr><th>UF</th><th className="text-right">Pedidos</th><th className="text-right">Custo</th><th className="text-right">Margem</th><th className="text-right">% despesa</th></tr></thead>
                    <tbody>
                      {fin.byState.map((x: any) => (
                        <tr key={x.key} className="selectable" onClick={() => setDrill({ title: `Pedidos — ${x.key}`, params: `drillState=${encodeURIComponent(x.key)}` })}>
                          <td>{x.key}</td><td className="text-right">{x.sales.orders}</td>
                          <td className="text-right nowrap">{money(x.sales.cost)}</td><td className="text-right" style={{ color: x.sales.margin < 0 ? 'var(--red)' : undefined }}>{pct(x.sales.margin)}</td><td className="text-right">{pct(x.sales.expensePct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Por transportadora" subtitle="Clique na linha para ver os pedidos" right={<button className="btn sm" disabled={!fin.byCarrier.length} onClick={exportCarriers}><Icon name="download" />Exportar</button>}>
            {fin.byCarrier.length === 0 ? <EmptyState text="Sem pedidos no período." /> : (
              <div className="table-wrap">
                <table className="stack">
                  <thead>
                    <tr><th>Transportadora</th><th className="text-right">Pedidos</th><th className="text-right">Cobrado</th><th className="text-right">Custo cotado</th><th className="text-right">Margem</th><th className="text-right">Auditados</th><th className="text-right">Pago (CT-e)</th><th className="text-right">Pago − cotado</th><th className="text-right">Margem auditada</th></tr>
                  </thead>
                  <tbody>
                    {fin.byCarrier.map((c: any) => (
                      <tr key={c.key} className="selectable" onClick={() => setDrill({ title: `Pedidos — ${c.carrierName}`, params: `drillCarrierId=${c.carrierId || 'sem'}` })}>
                        <td className="cell-title">{c.carrierName}</td>
                        <td data-label="Pedidos" className="text-right">{c.sales.orders}</td>
                        <td data-label="Cobrado" className="text-right nowrap">{money(c.sales.charged)}</td>
                        <td data-label="Custo cotado" className="text-right nowrap">{money(c.sales.cost)}</td>
                        <td data-label="Margem" className="text-right" style={{ color: c.sales.margin < 0 ? 'var(--red)' : undefined }}>{pct(c.sales.margin)}</td>
                        <td data-label="Auditados" className="text-right">{c.audited.orders} <span className="muted small">({pct(c.audited.pct)})</span></td>
                        <td data-label="Pago (CT-e)" className="text-right nowrap">{money(c.audited.paid)}</td>
                        <td data-label="Pago − cotado" className="text-right nowrap" style={{ color: c.audited.difference > 0 ? 'var(--red)' : undefined }}>{money(c.audited.difference)}</td>
                        <td data-label="Margem auditada" className="text-right">{pct(c.audited.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {drill ? <DrillModal title={drill.title} url={`/analytics/financial/orders?${drill.params}&${qs}`} columns={DRILL} fileName="financeiro-pedidos.csv" onClose={() => setDrill(null)} /> : null}
    </div>
  );
}
