'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { downloadCsv } from '@/services/csv';

export type DrillColumn = { label: string; value: (r: any) => ReactNode; csv?: (r: any) => string | number; right?: boolean };

// Lista de pedidos por trás de um indicador, com exportação CSV.
export function DrillModal({ title, url, columns, fileName, onClose }: { title: string; url: string; columns: DrillColumn[]; fileName: string; onClose: () => void }) {
  const { data, loading, error } = useApi(() => api(url), [url]);
  const items: any[] = (data as any)?.items || [];

  function exportCsv() {
    downloadCsv(fileName, items.map((r) => Object.fromEntries(columns.map((c) => [c.label, c.csv ? c.csv(r) : String(c.value(r) ?? '')]))));
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted">{loading ? '' : `${items.length} pedido(s)`}</span>
        <button className="btn sm" disabled={!items.length} onClick={exportCsv}><Icon name="download" />Exportar</button>
      </div>
      {loading ? <LoadingState /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState text="Nenhum pedido neste indicador." /> : (
        <div className="table-wrap" style={{ margin: 0, border: '1px solid var(--line)', borderRadius: 8, maxHeight: '60vh', overflowY: 'auto' }}>
          <table className="stack">
            <thead><tr>{columns.map((c) => <th key={c.label} className={c.right ? 'text-right' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  {columns.map((c, i) => (
                    <td key={c.label} data-label={c.label} className={i === 0 ? 'cell-title' : c.right ? 'text-right nowrap' : ''}>
                      {i === 0 ? <Link href={`/orders/${r.id}`} style={{ color: 'var(--brand)', fontWeight: 600 }}>{c.value(r)}</Link> : c.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
