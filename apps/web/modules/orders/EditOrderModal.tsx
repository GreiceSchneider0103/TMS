'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

const toLocal = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// Corrige dados de entrega, medidas e prazos (ex.: CEP inválido vindo do canal) antes de reprocessar.
export function EditOrderModal({ order, onClose, onSaved }: { order: any; onClose: () => void; onSaved: () => void }) {
  const p = order.raw_payload || {};
  const [f, setF] = useState({
    postalCode: p.postal_code || '', city: p.city || '', state: p.state || '', recipientType: p.recipient_type || 'PF',
    weight: p.weight_kg ?? '', weightUnit: 'kg', length: p.length_cm ?? '', width: p.width_cm ?? '', height: p.height_cm ?? '', dimensionUnit: 'cm',
    soldAt: toLocal(order.sold_at), shipByDate: toLocal(order.ship_by_date), promisedDeliveryDate: order.promised_delivery_date ? String(order.promised_delivery_date).slice(0, 10) : '',
    shippingAmount: order.shipping_amount ?? '', marketplaceCarrier: order.marketplace_carrier || ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setF((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      const body: Record<string, any> = {
        postalCode: f.postalCode, city: f.city, state: f.state, recipientType: f.recipientType,
        soldAt: f.soldAt ? new Date(f.soldAt).toISOString() : null,
        shipByDate: f.shipByDate ? new Date(f.shipByDate).toISOString() : null,
        promisedDeliveryDate: f.promisedDeliveryDate || null,
        shippingAmount: f.shippingAmount === '' ? null : f.shippingAmount,
        marketplaceCarrier: f.marketplaceCarrier || null
      };
      if (f.weight !== '' && f.length !== '' && f.width !== '' && f.height !== '') {
        Object.assign(body, { weight: f.weight, weightUnit: f.weightUnit, length: f.length, width: f.width, height: f.height, dimensionUnit: f.dimensionUnit });
      }
      await api(`/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Editar pedido #${order.order_number}`} onClose={onClose}>
      <div className="form-grid">
        <div className="form-section">Destino</div>
        <Field label="CEP" required><input className="input" inputMode="numeric" maxLength={9} value={f.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></Field>
        <Field label="Cidade"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="UF"><input className="input" maxLength={2} value={f.state} onChange={(e) => set('state', e.target.value.toUpperCase())} /></Field>
        <Field label="Tipo de destinatário">
          <select className="select" value={f.recipientType} onChange={(e) => set('recipientType', e.target.value)}><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select>
        </Field>

        <div className="form-section">Peso e medidas do volume</div>
        <Field label="Peso"><div className="num-unit"><input className="input" inputMode="decimal" value={f.weight} onChange={(e) => set('weight', e.target.value)} />
          <select className="select" value={f.weightUnit} onChange={(e) => set('weightUnit', e.target.value)}><option>g</option><option>kg</option><option>t</option><option>lb</option><option>oz</option></select></div></Field>
        <Field label="Comprimento"><input className="input" inputMode="decimal" value={f.length} onChange={(e) => set('length', e.target.value)} /></Field>
        <Field label="Largura"><input className="input" inputMode="decimal" value={f.width} onChange={(e) => set('width', e.target.value)} /></Field>
        <Field label="Altura"><input className="input" inputMode="decimal" value={f.height} onChange={(e) => set('height', e.target.value)} /></Field>
        <Field label="Unidade das medidas">
          <select className="select" value={f.dimensionUnit} onChange={(e) => set('dimensionUnit', e.target.value)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="pol">pol</option></select>
        </Field>

        <div className="form-section">Datas, prazos e frete</div>
        <Field label="Data da venda"><input className="input" type="datetime-local" value={f.soldAt} onChange={(e) => set('soldAt', e.target.value)} /></Field>
        <Field label="Postar até (prazo de expedição)"><input className="input" type="datetime-local" value={f.shipByDate} onChange={(e) => set('shipByDate', e.target.value)} /></Field>
        <Field label="Entrega prometida ao cliente"><input className="input" type="date" value={f.promisedDeliveryDate} onChange={(e) => set('promisedDeliveryDate', e.target.value)} /></Field>
        <Field label="Frete cobrado do cliente (R$)"><input className="input" inputMode="decimal" value={f.shippingAmount} onChange={(e) => set('shippingAmount', e.target.value)} /></Field>
        <Field label="Transportadora informada pelo canal" hint="Usada no de-para" className="span-2"><input className="input" value={f.marketplaceCarrier} onChange={(e) => set('marketplaceCarrier', e.target.value)} /></Field>
      </div>
      {error ? <div className="notice err">{error}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}
