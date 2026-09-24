'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

const STATUSES = [
  ['IN_TRANSIT', 'Em trânsito'],
  ['OUT_FOR_DELIVERY', 'Saiu para entrega'],
  ['DELIVERED', 'Entregue'],
  ['EXCEPTION', 'Ocorrência (avaria, extravio, tentativa sem sucesso...)'],
  ['RETURNED', 'Devolvido ao remetente'],
  ['CANCELED', 'Envio cancelado']
];

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// Atualização manual de rastreio, para transportadoras sem integração por API.
export function TrackingUpdateModal({ shipment, initialStatus = 'IN_TRANSIT', onClose, onSaved }: { shipment: { id: string; carrier_name?: string; tracking_code?: string }; initialStatus?: string; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(initialStatus);
  const [occurredAt, setOccurredAt] = useState(nowLocal());
  const [description, setDescription] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api(`/shipments/${shipment.id}/events`, {
        method: 'POST',
        body: JSON.stringify({ status, occurredAt: new Date(occurredAt).toISOString(), description, receiverName: status === 'DELIVERED' ? receiverName : undefined, notes })
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Atualizar rastreio" onClose={onClose} size="sm">
      <p className="muted small" style={{ margin: 0 }}>{shipment.carrier_name || 'Transportadora'}{shipment.tracking_code ? ` · rastreio ${shipment.tracking_code}` : ''}</p>
      <Field label="Situação" required>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Data e hora" required>
        <input className="input" type="datetime-local" value={occurredAt} max={nowLocal()} onChange={(e) => setOccurredAt(e.target.value)} />
      </Field>
      {status === 'DELIVERED' ? (
        <Field label="Recebido por" hint="Nome de quem recebeu, se a transportadora informou">
          <input className="input" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Descrição" hint="Opcional — aparece no histórico de rastreio">
        <input className="input" placeholder={STATUSES.find(([v]) => v === status)?.[1]} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {['DELIVERED', 'EXCEPTION', 'RETURNED'].includes(status) ? (
        <Field label="Observações"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      ) : null}
      {error ? <div className="notice err">{error}</div> : null}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Salvando...' : status === 'DELIVERED' ? 'Confirmar entrega' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}
