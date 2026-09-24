'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { useApi } from '@/hooks/useApi';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { formatMoney } from '@/services/format';

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// Despacho manual: registra o embarque sem depender de integração com a transportadora.
export function ManualDispatchModal({ order, onClose, onSaved }: { order: any; onClose: () => void; onSaved: () => void }) {
  const carriers = useApi(() => api('/carriers'), []);
  const services = useApi(() => api('/carrier-services'), []);
  const quote = useApi(() => api(`/quotes/order/${order.id}`), [order.id]);
  const selected = ((quote.data as any)?.results || []).find((r: any) => r.selected);
  const [carrierId, setCarrierId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dispatchedAt, setDispatchedAt] = useState(nowLocal());
  const [transitDays, setTransitDays] = useState('');
  const [freightAmount, setFreightAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const carrierItems: any[] = (carriers.data as any)?.items || [];
  const effectiveCarrier = carrierId || selected?.carrier_id || '';
  const serviceItems: any[] = ((services.data as any)?.items || []).filter((s: any) => s.carrier_id === effectiveCarrier);
  const usesQuote = selected && selected.carrier_id === effectiveCarrier;

  async function save() {
    if (!effectiveCarrier) return setError('Escolha a transportadora.');
    setBusy(true);
    setError('');
    try {
      await api(`/orders/${order.id}/manual-dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          carrierId: effectiveCarrier, carrierServiceId: serviceId || undefined, trackingCode, invoiceNumber: invoiceNumber || undefined,
          dispatchedAt: new Date(dispatchedAt).toISOString(), transitDays: transitDays === '' ? undefined : Number(transitDays),
          freightAmount: freightAmount === '' ? undefined : freightAmount
        })
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Despachar manualmente — pedido #${order.order_number}`} onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>Use quando a transportadora não tem integração de rastreio. Depois, atualize a entrega pelo botão “Atualizar rastreio”.</p>
      <div className="form-grid">
        <Field label="Transportadora" required>
          <select className="select" value={effectiveCarrier} onChange={(e) => { setCarrierId(e.target.value); setServiceId(''); }}>
            <option value="">Escolha...</option>
            {carrierItems.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Serviço">
          <select className="select" value={serviceId} disabled={!serviceItems.length} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">{serviceItems.length ? 'Escolha...' : 'Nenhum cadastrado'}</option>
            {serviceItems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Código de rastreio"><input className="input" value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} /></Field>
        <Field label="Data e hora do despacho" required><input className="input" type="datetime-local" value={dispatchedAt} max={nowLocal()} onChange={(e) => setDispatchedAt(e.target.value)} /></Field>
        <Field label="Prazo de transporte (dias úteis)" hint={usesQuote ? `Da cotação: ${selected.total_days} dia(s)` : 'Usado para calcular a previsão de entrega'}>
          <input className="input" inputMode="numeric" placeholder={usesQuote ? String(selected.total_days ?? '') : ''} value={transitDays} onChange={(e) => setTransitDays(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Nº da nota fiscal" hint="Em branco = usa a NF cadastrada no pedido">
          <input className="input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </Field>
        {!usesQuote ? (
          <Field label="Frete contratado (R$)" hint="Sem cotação desta transportadora: informe para a auditoria">
            <input className="input" inputMode="decimal" value={freightAmount} onChange={(e) => setFreightAmount(e.target.value)} />
          </Field>
        ) : (
          <div className="detail-item" style={{ alignSelf: 'center' }}><small>Frete contratado (cotação)</small><strong>{formatMoney(selected.total_amount)}</strong></div>
        )}
      </div>
      {error ? <div className="notice err">{error}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy || !effectiveCarrier} onClick={save}>{busy ? 'Registrando...' : 'Registrar despacho'}</button>
      </div>
    </Modal>
  );
}
