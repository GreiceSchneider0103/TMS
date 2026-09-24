import { formatDate } from './format';
import type { Tone } from './format';

const today = () => new Date().toISOString().slice(0, 10);
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);

// Situação de prazo do pedido/embarque para exibir na lista e no detalhe.
export function deadlineInfo(o: {
  ship_by_date?: string | null; dispatched_at?: string | null; estimated_delivery_date?: string | null; delivered_at?: string | null;
  promised_delivery_date?: string | null; shipment_id?: string | null;
}): { label: string; tone: Tone } | null {
  const est = day(o.estimated_delivery_date);
  const delivered = day(o.delivered_at);
  if (delivered) {
    const late = (est && delivered > est) || (o.promised_delivery_date && delivered > day(o.promised_delivery_date)!);
    return { label: `Entregue ${formatDate(o.delivered_at)}${late ? ' (com atraso)' : ''}`, tone: late ? 'warning' : 'success' };
  }
  if (o.dispatched_at || o.shipment_id) {
    if (!est) return { label: 'Em transporte', tone: 'info' };
    return est < today() ? { label: `Atrasado (previsto ${formatDate(est)})`, tone: 'error' } : { label: `Previsto ${formatDate(est)}`, tone: 'info' };
  }
  const shipBy = day(o.ship_by_date);
  if (!shipBy) return null;
  return shipBy < today() ? { label: `Expedição atrasada (${formatDate(shipBy)})`, tone: 'error' } : { label: `Postar até ${formatDate(shipBy)}`, tone: 'warning' };
}

export function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const ms = new Date(String(b).slice(0, 10)).getTime() - new Date(String(a).slice(0, 10)).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}
