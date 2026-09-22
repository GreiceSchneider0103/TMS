'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

export function ShipmentsList() {
  const [nonce, setNonce] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const { data, loading, error } = useApi(() => api('/shipments'), [nonce]);
  const items = (data as any)?.items || [];

  return (
    <div className="grid">
      <PageHeader title="Embarques" subtitle="Controle de envios e despachos" actions={<button className="btn primary" onClick={() => setShowModal(true)}>Criar Embarque</button>} />
      <Panel title="Lista de Embarques" subtitle="O rastreio é atualizado automaticamente pelos workers agendados (Total Express / RTE)." right={<button className="btn" onClick={() => setNonce((v) => v + 1)}>Atualizar</button>}>
        {loading ? <LoadingState text="Carregando embarques..." /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Shipment ID</th><th>Pedido</th><th>Transportadora</th><th>Código Rastreio</th><th>Status</th><th>Data Envio</th><th>Ações</th></tr></thead>
              <tbody>
                {items.map((s: any) => (
                  <tr key={s.id}>
                    <td className="mono">{s.id.slice(0, 8)}</td>
                    <td>{s.order_id?.slice(0, 8)}</td>
                    <td>{s.carrier_name || s.carrier_id || '-'}</td>
                    <td>{s.tracking_code || '-'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn ghost" href={`/shipments/${s.id}`}>Ver</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {showModal ? <CreateShipmentModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); setNonce((v) => v + 1); }} /> : null}
    </div>
  );
}

function CreateShipmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [orderId, setOrderId] = useState('');
  const [quoteResultId, setQuoteResultId] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [weightKg, setWeightKg] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    if (!orderId.trim() || !quoteResultId.trim()) return setMessage('Informe orderId e quoteResultId.');
    setBusy(true);
    setMessage('');
    try {
      await api('/shipments', {
        method: 'POST',
        body: JSON.stringify({
          orderId: orderId.trim(),
          quoteResultId: quoteResultId.trim(),
          trackingCode: trackingCode.trim() || undefined,
          weightKg: Number(weightKg) || 1
        })
      });
      onCreated();
    } catch (e: any) {
      setMessage(e.message || 'Falha ao criar embarque');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="panel-head"><h3>Criar Embarque</h3><button className="btn ghost" onClick={onClose}>Fechar</button></div>
        <div className="panel-body grid">
          <div className="form-grid">
            <input className="input" placeholder="Order ID (obrigatório)" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
            <input className="input" placeholder="Quote Result ID (obrigatório - cotação selecionada)" value={quoteResultId} onChange={(e) => setQuoteResultId(e.target.value)} />
            <input className="input" placeholder="Código de rastreio (opcional)" value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} />
            <input className="input" type="number" placeholder="Peso (kg)" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          </div>
          {message ? <div className="empty-state">{message}</div> : null}
          <div className="filter-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn primary" disabled={busy} onClick={submit}>Criar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
