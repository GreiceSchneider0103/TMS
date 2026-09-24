'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { api } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { channelLabel, formatDate, formatMoney } from '@/services/format';

export function ShipmentsList() {
  const [showModal, setShowModal] = useState(false);
  const { data, loading, error, reload } = useApi(() => api('/shipments'), []);
  const items = (data as any)?.items || [];

  return (
    <div className="grid">
      <PageHeader title="Embarques" subtitle="Pedidos despachados e seus códigos de rastreio" actions={<button className="btn primary" onClick={() => setShowModal(true)}><Icon name="plus" />Novo embarque</button>} />
      <Panel title="Lista de embarques" subtitle={loading ? undefined : `${items.length} embarque(s)`} right={<button className="btn sm" onClick={reload}><Icon name="refresh" />Atualizar</button>}>
        {loading ? <LoadingState text="Carregando embarques..." /> : error ? <ErrorState text={error} /> : items.length === 0 ? <EmptyState text="Nenhum embarque criado ainda." /> : (
          <div className="table-wrap">
            <table className="stack">
              <thead><tr><th>Pedido</th><th>Transportadora</th><th>Código de rastreio</th><th>Situação</th><th>Criado em</th><th></th></tr></thead>
              <tbody>
                {items.map((s: any) => (
                  <tr key={s.id}>
                    <td className="cell-title">
                      <Link href={`/orders/${s.order_id}`} style={{ color: 'var(--brand)', fontWeight: 600 }}>#{s.order_number || '-'}</Link>
                      <span className="sub">{channelLabel(s.channel)}</span>
                    </td>
                    <td data-label="Transportadora">{s.carrier_name || '-'}</td>
                    <td data-label="Rastreio">{s.tracking_code || <span className="muted">Aguardando</span>}</td>
                    <td data-label="Situação"><StatusBadge status={s.status} /></td>
                    <td data-label="Criado em" className="nowrap">{formatDate(s.created_at)}</td>
                    <td data-label="" className="text-right"><Link className="btn ghost sm" href={`/shipments/${s.id}`}>Detalhes</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {showModal ? <CreateShipmentModal onClose={() => setShowModal(false)} onCreated={() => { setShowModal(false); reload(); }} /> : null}
    </div>
  );
}

function CreateShipmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const router = useRouter();
  const orders = useApi(() => api('/orders?limit=200'), []);
  const [orderId, setOrderId] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [weightKg, setWeightKg] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // Só pedidos com cotação selecionada e ainda sem embarque podem ser despachados por aqui.
  const ready = ((orders.data as any)?.items || []).filter((o: any) => o.selected_quote_result_id && !o.shipment_id);
  const order = ready.find((o: any) => o.id === orderId);

  async function submit() {
    if (!order) return setMessage('Selecione um pedido.');
    setBusy(true);
    setMessage('');
    try {
      await api('/shipments', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          quoteResultId: order.selected_quote_result_id,
          trackingCode: trackingCode.trim() || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          weightKg: Number(weightKg.replace(',', '.')) || 1
        })
      });
      onCreated();
    } catch (e: any) {
      setMessage(e.message || 'Não foi possível criar o embarque.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Novo embarque" onClose={onClose}>
      {orders.loading ? <LoadingState text="Carregando pedidos..." /> : ready.length === 0 ? (
        <div className="notice info">
          Nenhum pedido pronto para despacho. Primeiro calcule e selecione uma cotação em <button className="btn ghost sm" onClick={() => router.push('/quotes')}>Cotações</button>.
        </div>
      ) : (
        <div className="form-grid">
          <Field label="Pedido" required className="full">
            <select className="select" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Escolha um pedido com cotação selecionada...</option>
              {ready.map((o: any) => <option key={o.id} value={o.id}>#{o.order_number} · {o.carrier_name || 'transportadora'} · {formatMoney(o.selected_quote_amount)}</option>)}
            </select>
          </Field>
          <Field label="Código de rastreio" hint="Opcional — pode ser informado depois">
            <input className="input" value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} />
          </Field>
          <Field label="Número da nota fiscal">
            <input className="input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
          <Field label="Peso (kg)">
            <input className="input" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          </Field>
        </div>
      )}
      {message ? <div className="notice err">{message}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy || !order} onClick={submit}>{busy ? 'Criando...' : 'Criar embarque'}</button>
      </div>
    </Modal>
  );
}
