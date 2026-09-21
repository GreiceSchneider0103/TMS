'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default function QuotesPage() {
  const [orderId, setOrderId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const results = out?.results || [];

  return (
    <div className="grid">
      <PageHeader title="Cotações" subtitle="Histórico e simulação de frete" actions={<button className="btn primary">Exportar</button>} />

      <Panel title="Simulação / Consulta de cotação">
        <div className="filter-row">
          <input className="input" placeholder="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          <button className="btn primary" disabled={busy || !orderId} onClick={async () => {
            setBusy(true);
            try {
              setOut(await api(`/quotes/automatic/${orderId}`, { method: 'POST', body: '{}' }));
            } catch (e: any) {
              setOut({ error: e.message });
            } finally { setBusy(false); }
          }}>Buscar quotes</button>

          <input className="input" placeholder="Quote Result ID" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} />
          <button className="btn" disabled={busy || !quoteId} onClick={async () => {
            setBusy(true);
            try {
              setOut(await api(`/quotes/results/${quoteId}/select`, { method: 'PATCH', body: '{}' }));
            } catch (e: any) {
              setOut({ error: e.message });
            } finally { setBusy(false); }
          }}>Escolher quote</button>
        </div>

        {out?.error ? <p className="text-error">{out.error}</p> : null}

        <div className="table-wrap">
          <table>
            <thead><tr><th>ID Cotação</th><th>Transportadora</th><th>Valor</th><th>Prazo</th><th>Status</th></tr></thead>
            <tbody>
              {results.length ? results.map((q: any) => (
                <tr key={q.id}>
                  <td className="mono">{q.id}</td>
                  <td>{q.carrier_name || q.carrier_id || '-'}</td>
                  <td>R$ {Number(q.total_amount || 0).toFixed(2)}</td>
                  <td>{q.total_days || '-'} dias</td>
                  <td><StatusBadge status={q.selected ? 'Aprovado' : 'Pendente'} /></td>
                </tr>
              )) : (
                <tr><td colSpan={5}><div className="empty-state">Faça uma consulta para visualizar resultados.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
