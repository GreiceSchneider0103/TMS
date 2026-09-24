'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Panel } from '@/components/ui/Panel';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { downloadCsv } from '@/services/csv';
import { channelLabel, formatDate, formatMoney, statusInfo } from '@/services/format';

const STATUS_FILTERS = [
  ['all', 'Todas'],
  ['divergente', 'Com divergência'],
  ['pago_acima', 'Pago acima do contratado'],
  ['pago_abaixo', 'Pago abaixo do contratado'],
  ['conciliado', 'Conciliados'],
  ['sem_cte', 'Sem CT-e']
];

const money = (v: number | null) => (v === null || v === undefined ? '-' : formatMoney(v));
const diffClass = (v: number | null) => (v === null || Math.abs(v) < 0.005 ? '' : v > 0 ? 'text-error' : '');

export function Reconciliation({ onGoToCtes }: { onGoToCtes: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tolerance, setTolerance] = useState('1');
  const [status, setStatus] = useState('all');
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), tolerancePct: tolerance || '0' }).toString();
  const { data, loading, error, reload } = useApi(() => api(`/freight-audit?${qs}`), [qs]);

  const items: any[] = (data as any)?.items || [];
  const t = (data as any)?.totals || {};
  const filtered = items.filter((i) => status === 'all' || (status === 'divergente' ? ['pago_acima', 'pago_abaixo'].includes(i.audit_status) : i.audit_status === status));

  function exportCsv() {
    const n = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));
    downloadCsv('auditoria-frete.csv', filtered.map((i) => ({
      Pedido: i.order_number, Canal: channelLabel(i.channel), Transportadora: i.carrier_name || '', Data: formatDate(i.created_at),
      'Frete cobrado': n(i.charged), 'Frete contratado': n(i.contracted), 'Frete pago (CT-e)': n(i.paid),
      'Pago - contratado': n(i.paid_vs_contracted), 'Margem (cobrado - pago)': n(i.margin), 'CT-e': i.cte_numbers || '', Situação: statusInfo(i.audit_status).label
    })));
  }

  return (
    <div className="grid">
      <div className="kpi-grid">
        <StatCard title="Frete cobrado dos clientes" value={formatMoney(t.charged || 0)} />
        <StatCard title="Frete contratado (cotação)" value={formatMoney(t.contracted || 0)} />
        <StatCard title="Frete pago (CT-e)" value={formatMoney(t.paid || 0)} tone="info" />
        <StatCard title="Pago a mais que o contratado" value={formatMoney(t.overpaid || 0)} tone={t.overpaid > 0 ? 'error' : 'success'} />
        <StatCard title="Embarques com divergência" value={t.divergent ?? 0} tone={t.divergent ? 'error' : 'success'} />
        <StatCard title="Embarques sem CT-e" value={t.withoutCte ?? 0} tone="warning" />
        <StatCard title="CT-es sem vínculo" value={t.unmatchedCtes ?? 0} tone={t.unmatchedCtes ? 'warning' : 'neutral'} />
        <StatCard title="Valor em CT-es sem vínculo" value={formatMoney(t.unmatchedCtesAmount || 0)} />
      </div>

      {t.unmatchedCtes ? (
        <div className="notice warn">
          Existem {t.unmatchedCtes} CT-e(s) que não foram ligados a nenhum embarque.{' '}
          <button className="btn ghost sm" onClick={onGoToCtes}>Revisar CT-es</button>
        </div>
      ) : null}

      <Panel title="Conciliação por embarque" subtitle="Cobrado do cliente × contratado na cotação × pago no CT-e" right={
        <div className="row-actions">
          <button className="btn sm" disabled={!filtered.length} onClick={exportCsv}><Icon name="download" />Exportar</button>
          <button className="btn sm" onClick={reload}><Icon name="refresh" />Atualizar</button>
        </div>
      }>
        <div className="filter-row">
          <Field label="Embarques de"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Até"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Situação">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Tolerância (%)" hint="Diferença aceita sem apontar divergência">
            <input className="input" inputMode="decimal" value={tolerance} onChange={(e) => setTolerance(e.target.value.replace(',', '.'))} />
          </Field>
        </div>

        {loading ? <LoadingState text="Calculando conciliação..." /> : error ? <ErrorState text={error} /> : filtered.length === 0 ? <EmptyState text="Nenhum embarque para os filtros selecionados." /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr><th>Pedido</th><th>Transportadora</th><th className="text-right">Cobrado</th><th className="text-right">Contratado</th><th className="text-right">Pago (CT-e)</th><th className="text-right">Diferença</th><th className="text-right">Margem</th><th>Situação</th></tr></thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.shipment_id}>
                    <td className="cell-title">
                      <Link href={`/shipments/${i.shipment_id}`} style={{ color: 'var(--brand)', fontWeight: 600 }}>#{i.order_number}</Link>
                      <span className="sub">{channelLabel(i.channel)} · {formatDate(i.created_at)}{i.cte_numbers ? ` · CT-e ${i.cte_numbers}` : ''}</span>
                    </td>
                    <td data-label="Transportadora">{i.carrier_name || '-'}</td>
                    <td data-label="Cobrado" className="text-right nowrap">{money(i.charged)}</td>
                    <td data-label="Contratado" className="text-right nowrap">{money(i.contracted)}</td>
                    <td data-label="Pago (CT-e)" className="text-right nowrap">{money(i.paid)}</td>
                    <td data-label="Diferença (pago − contratado)" className={`text-right nowrap ${diffClass(i.paid_vs_contracted)}`}>{i.paid_vs_contracted === null ? '-' : `${i.paid_vs_contracted > 0 ? '+' : ''}${formatMoney(i.paid_vs_contracted)}`}</td>
                    <td data-label="Margem" className={`text-right nowrap ${i.margin !== null && i.margin < 0 ? 'text-error' : ''}`}>{money(i.margin)}</td>
                    <td data-label="Situação"><StatusBadge status={i.audit_status} /></td>
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
