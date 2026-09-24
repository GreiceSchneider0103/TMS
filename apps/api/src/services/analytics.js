import { query } from '../db.js';
import { businessDaysBetween } from './deadlines.js';

// ---------- UF e regiões ----------
// Faixas de CEP (5 primeiros dígitos) por UF — usadas quando o canal não informa o estado.
export const CEP_RANGES = [
  [1000, 19999, 'SP'], [20000, 28999, 'RJ'], [29000, 29999, 'ES'], [30000, 39999, 'MG'], [40000, 48999, 'BA'], [49000, 49999, 'SE'],
  [50000, 56999, 'PE'], [57000, 57999, 'AL'], [58000, 58999, 'PB'], [59000, 59999, 'RN'], [60000, 63999, 'CE'], [64000, 64999, 'PI'],
  [65000, 65999, 'MA'], [66000, 68899, 'PA'], [68900, 68999, 'AP'], [69000, 69299, 'AM'], [69300, 69399, 'RR'], [69400, 69899, 'AM'],
  [69900, 69999, 'AC'], [70000, 72799, 'DF'], [72800, 72999, 'GO'], [73000, 73699, 'DF'], [73700, 76799, 'GO'], [76800, 76999, 'RO'],
  [77000, 77999, 'TO'], [78000, 78899, 'MT'], [79000, 79999, 'MS'], [80000, 87999, 'PR'], [88000, 89999, 'SC'], [90000, 99999, 'RS']
];
const UFS = new Set(CEP_RANGES.map((r) => r[2]));

export function cepToUf(cep) {
  const d = String(cep || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const n = Number(d.slice(0, 5));
  return CEP_RANGES.find(([a, b]) => n >= a && n <= b)?.[2] || null;
}

export const REGIONS = {
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC']
};
const regionOf = (uf) => Object.entries(REGIONS).find(([, list]) => list.includes(uf))?.[0] || 'Sem UF';

// ---------- Fatos por pedido ----------
const MAX_ROWS = 20000;

export function parseFilters(qs = {}) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const days = Math.min(365, Math.max(1, Number(qs.days) || 30));
  const to = /^\d{4}-\d{2}-\d{2}$/.test(qs.to || '') ? qs.to : iso(today);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(qs.from || '') ? qs.from : iso(new Date(Date.parse(`${to}T12:00:00Z`) - (days - 1) * 86400000));
  return {
    from, to,
    channel: qs.channel || null,
    carrierId: /^[0-9a-f-]{36}$/i.test(qs.carrierId || '') ? qs.carrierId : null,
    state: qs.state ? String(qs.state).toUpperCase() : null,
    region: qs.region && REGIONS[qs.region] ? qs.region : null
  };
}

// Carrega uma linha por pedido do período com o embarque mais recente, cotação, CT-es e última ocorrência.
export async function loadFacts(accountId, f) {
  const { rows } = await query(
    `select o.id, o.order_number, o.channel, o.status, coalesce(o.sold_at, o.created_at) as sold_at, o.ship_by_date, o.promised_delivery_date,
            o.raw_payload->>'state' as state_raw, o.raw_payload->>'postal_code' as postal_code, o.raw_payload->>'city' as city,
            coalesce(o.invoice_amount, o.total_amount) as invoice_value, o.total_amount, o.shipping_amount, o.ignore_cost,
            s.id as shipment_id, s.status as shipment_status, s.carrier_id, c.name as carrier_name, s.dispatched_at, s.estimated_delivery_date,
            s.delivered_at, s.tracking_code,
            coalesce(qr.total_amount, s.freight_amount) as contracted, (qr.breakdown->>'billableWeight')::numeric as kg_calc,
            ct.paid, ct.kg_charged, coalesce(ct.n, 0) as cte_count,
            ev.external_status as exception_text,
            (select count(*) from app.order_invoices oi where oi.account_id = o.account_id and oi.order_id = o.id) as invoice_count
     from app.orders o
     left join lateral (
       select * from app.shipments x where x.account_id = o.account_id and x.order_id = o.id and x.status <> 'CANCELED'
       order by x.created_at desc limit 1
     ) s on true
     left join app.carriers c on c.id = s.carrier_id
     left join app.quote_results qr on qr.id = s.quote_result_id
     left join lateral (
       select sum(t.valor_prestacao) as paid, sum(t.peso_cobrado) as kg_charged, count(*) as n
       from app.ctes t where t.account_id = o.account_id and t.shipment_id = s.id
     ) ct on true
     left join lateral (
       select e.external_status from app.tracking_events e
       where e.account_id = o.account_id and e.shipment_id = s.id and e.macro_status = 'EXCEPTION' order by e.occurred_at desc limit 1
     ) ev on true
     where o.account_id = $1 and not o.integration_ignored
       and coalesce(o.sold_at, o.created_at) >= $2::date and coalesce(o.sold_at, o.created_at) < ($3::date + interval '1 day')
       and ($4::text is null or o.channel = $4)
       and ($5::uuid is null or s.carrier_id = $5)
     order by coalesce(o.sold_at, o.created_at) desc
     limit ${MAX_ROWS}`,
    [accountId, f.from, f.to, f.channel, f.carrierId]
  );

  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return rows
    .map((r) => {
      const uf = (r.state_raw && UFS.has(String(r.state_raw).toUpperCase()) ? String(r.state_raw).toUpperCase() : null) || cepToUf(r.postal_code);
      return {
        ...r,
        uf,
        region: uf ? regionOf(uf) : 'Sem UF',
        invoice_value: num(r.invoice_value),
        shipping_amount: num(r.shipping_amount),
        contracted: num(r.contracted),
        paid: Number(r.cte_count) > 0 ? num(r.paid) : null,
        kg_calc: num(r.kg_calc),
        kg_charged: num(r.kg_charged),
        cte_count: Number(r.cte_count),
        invoice_count: Number(r.invoice_count)
      };
    })
    .filter((r) => (!f.state || r.uf === f.state) && (!f.region || r.region === f.region));
}

// ---------- Torre de controle ----------
const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);
const dateOnly = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);

function classify(f, today) {
  const status = f.shipment_status || f.status;
  const est = dateOnly(f.estimated_delivery_date);
  const promised = dateOnly(f.promised_delivery_date);
  const delivered = f.delivered_at ? day(f.delivered_at) : null;
  const isDelivered = status === 'DELIVERED' || Boolean(delivered);
  const closed = isDelivered || ['CANCELED', 'RETURNED'].includes(status);
  const inProgress = Boolean(f.shipment_id) && ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(status);
  const waiting = !f.shipment_id && !['CANCELED', 'DELIVERED', 'RETURNED'].includes(f.status);
  const exc = String(f.exception_text || '').toLowerCase();
  const exception = status === 'EXCEPTION';

  return {
    total: f.status !== 'CANCELED',
    aguardando_envio: waiting,
    expedicao_atrasada: waiting && f.ship_by_date && new Date(f.ship_by_date) < new Date(),
    sem_nf: waiting && f.invoice_count === 0,
    em_andamento: inProgress,
    entregues: isDelivered,
    atraso_transporte_entregues: isDelivered && est && delivered && delivered > est,
    atraso_transporte_abertos: inProgress && est && est < today,
    atraso_pedido_entregues: isDelivered && promised && delivered && delivered > promised,
    atraso_pedido_abertos: !closed && promised && promised < today,
    previsao_atraso: !closed && est && promised && est > promised && promised >= today,
    ocorrencias: exception,
    avaria: exception && /avaria|danific|quebrad/.test(exc),
    extravio: exception && /extravi|perdid|nao localizad|não localizad/.test(exc),
    roubo: exception && /roubo|furto|sinistro/.test(exc),
    tentativa: exception && /tentativa|ausente|recusad|endereco|endereço/.test(exc),
    devolvidos: status === 'RETURNED',
    cancelados: f.status === 'CANCELED'
  };
}

export const TOWER_CARDS = [
  ['total', 'Total de pedidos'], ['aguardando_envio', 'Aguardando envio'], ['expedicao_atrasada', 'Expedição atrasada'], ['sem_nf', 'Aguardando NF'],
  ['em_andamento', 'Em andamento'], ['entregues', 'Entregues'],
  ['atraso_transporte_entregues', 'Atraso transporte (entregues)'], ['atraso_transporte_abertos', 'Atraso transporte (não entregues)'],
  ['atraso_pedido_entregues', 'Atraso pedido (entregues)'], ['atraso_pedido_abertos', 'Atraso pedido (não entregues)'],
  ['previsao_atraso', 'Previsão de atraso'], ['ocorrencias', 'Ocorrências'], ['avaria', 'Avaria'], ['extravio', 'Extravio'], ['roubo', 'Roubo'],
  ['tentativa', 'Tentativa de entrega'], ['devolvidos', 'Devolvidos'], ['cancelados', 'Cancelados']
];

function histogram(values, labels) {
  const buckets = labels.map((label) => ({ label, count: 0 }));
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const i = Math.min(labels.length - 1, Math.max(0, Math.floor(v)));
    buckets[i].count += 1;
  }
  return buckets;
}

export function controlTower(facts, openIssues = 0) {
  const today = new Date().toISOString().slice(0, 10);
  const classified = facts.map((f) => ({ f, c: classify(f, today) }));
  const counts = Object.fromEntries(TOWER_CARDS.map(([k]) => [k, classified.filter((x) => x.c[k]).length]));

  // Entregas por dia: ontem até 4 dias à frente (previsão da transportadora e data prometida).
  const daysAround = [-1, 0, 1, 2, 3, 4].map((d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10));
  const byDay = (field) => daysAround.map((d) => {
    const due = classified.filter(({ f }) => dateOnly(f[field]) === d && f.status !== 'CANCELED');
    const delivered = due.filter(({ c }) => c.entregues).length;
    return { date: d, total: due.length, delivered, pending: due.length - delivered };
  });
  const toShip = classified.filter(({ c }) => c.aguardando_envio);
  const shipByDays = daysAround.slice(1).map((d) => ({ date: d, count: toShip.filter(({ f }) => day(f.ship_by_date) === d).length }));

  const dispatchDays = facts.filter((f) => f.dispatched_at).map((f) => businessDaysBetween(f.sold_at, f.dispatched_at));
  const waitingDays = toShip.map(({ f }) => businessDaysBetween(f.sold_at, new Date()));
  const labels = ['0', '1', '2', '3', '4', '5+'];

  // Por UF e por região: volume, entregas e atrasos de transporte.
  const agg = (keyFn) => {
    const map = new Map();
    for (const { f, c } of classified) {
      if (!c.total) continue;
      const k = keyFn(f);
      const a = map.get(k) || { key: k, total: 0, inProgress: 0, delivered: 0, late: 0, lateOrder: 0 };
      a.total += 1;
      if (c.em_andamento) a.inProgress += 1;
      if (c.entregues) a.delivered += 1;
      if (c.atraso_transporte_entregues || c.atraso_transporte_abertos) a.late += 1;
      if (c.atraso_pedido_entregues || c.atraso_pedido_abertos) a.lateOrder += 1;
      map.set(k, a);
    }
    return [...map.values()].map((a) => ({ ...a, latePct: a.delivered + a.inProgress ? round1((a.late / (a.delivered + a.inProgress)) * 100) : 0 })).sort((x, y) => y.total - x.total);
  };

  return {
    counts: { ...counts, pendencias: openIssues },
    cards: TOWER_CARDS.map(([key, label]) => ({ key, label, count: counts[key] })),
    deliveriesTransport: byDay('estimated_delivery_date'),
    deliveriesPromised: byDay('promised_delivery_date'),
    toShip: { late: counts.expedicao_atrasada, byDay: shipByDays },
    dispatchTime: { buckets: histogram(dispatchDays, labels), average: dispatchDays.length ? round1(dispatchDays.reduce((a, b) => a + b, 0) / dispatchDays.length) : null },
    waiting: { buckets: histogram(waitingDays, labels) },
    byState: agg((f) => f.uf || 'Sem UF'),
    byRegion: agg((f) => f.region)
  };
}

export function towerOrders(facts, card) {
  const today = new Date().toISOString().slice(0, 10);
  return facts.filter((f) => classify(f, today)[card]);
}

// ---------- Financeiro ----------
function money(items) {
  const withCharge = items.filter((i) => i.shipping_amount != null);
  const charged = sum(items.map((i) => i.shipping_amount));
  const cost = sum(items.map((i) => i.contracted));
  const invoice = sum(items.map((i) => i.invoice_value));
  const audited = items.filter((i) => i.paid != null);
  const aCharged = sum(audited.map((i) => i.shipping_amount));
  const aPaid = sum(audited.map((i) => i.paid));
  const aContracted = sum(audited.map((i) => i.contracted));
  const aInvoice = sum(audited.map((i) => i.invoice_value));
  return {
    sales: {
      orders: items.length,
      withCharge: withCharge.length,
      invoice, charged, cost,
      profit: round2(charged - cost),
      margin: charged ? round1(((charged - cost) / charged) * 100) : null,
      expensePct: invoice ? round2((cost / invoice) * 100) : null
    },
    audited: {
      orders: audited.length,
      pct: items.length ? round1((audited.length / items.length) * 100) : 0,
      invoice: aInvoice, charged: aCharged, paid: aPaid, contracted: aContracted,
      profit: round2(aCharged - aPaid),
      margin: aCharged ? round1(((aCharged - aPaid) / aCharged) * 100) : null,
      expensePct: aInvoice ? round2((aPaid / aInvoice) * 100) : null,
      difference: round2(aPaid - aContracted)
    }
  };
}

export function financial(facts) {
  // Considera pedidos com embarque ou cotação, excluindo os que o de-para marca como "não considerar custo".
  const items = facts.filter((f) => !f.ignore_cost && f.status !== 'CANCELED' && (f.shipment_id || f.contracted != null));
  const group = (keyFn, extra = () => ({})) => {
    const map = new Map();
    for (const i of items) {
      const k = keyFn(i);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
    return [...map.entries()].map(([key, list]) => ({ key, ...extra(list[0]), ...money(list) })).sort((a, b) => b.sales.orders - a.sales.orders);
  };
  return {
    totals: money(items),
    byCarrier: group((i) => i.carrier_id || 'sem', (i) => ({ carrierId: i.carrier_id, carrierName: i.carrier_name || 'Sem transportadora' })),
    byState: group((i) => i.uf || 'Sem UF'),
    byRegion: group((i) => i.region)
  };
}

export function financialOrders(facts, { carrierId = null, state = null } = {}) {
  return facts
    .filter((f) => !f.ignore_cost && f.status !== 'CANCELED' && (f.shipment_id || f.contracted != null))
    .filter((f) => (!carrierId || (carrierId === 'sem' ? !f.carrier_id : f.carrier_id === carrierId)) && (!state || (f.uf || 'Sem UF') === state))
    .map((f) => ({
      id: f.id, order_number: f.order_number, channel: f.channel, sold_at: f.sold_at, uf: f.uf, carrier_name: f.carrier_name,
      estimated_delivery_date: f.estimated_delivery_date, invoice_value: f.invoice_value, charged: f.shipping_amount, cost: f.contracted,
      profit: f.shipping_amount != null && f.contracted != null ? round2(f.shipping_amount - f.contracted) : null,
      paid: f.paid,
      profit_paid: f.shipping_amount != null && f.paid != null ? round2(f.shipping_amount - f.paid) : null,
      margin: f.shipping_amount && f.paid != null ? round1(((f.shipping_amount - f.paid) / f.shipping_amount) * 100) : null,
      difference: f.paid != null && f.contracted != null ? round2(f.paid - f.contracted) : null,
      kg_calc: f.kg_calc, kg_charged: f.kg_charged
    }));
}

const sum = (arr) => round2(arr.reduce((a, b) => a + (b === null || b === undefined ? 0 : Number(b)), 0));
const round2 = (n) => Number(Number(n).toFixed(2));
const round1 = (n) => Number(Number(n).toFixed(1));
