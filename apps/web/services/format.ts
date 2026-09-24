// Formatação e rótulos em pt-BR usados em todas as telas.

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numberFmt = new Intl.NumberFormat('pt-BR');

export function formatMoney(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? moneyFmt.format(n) : '-';
}

export function formatNumber(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? numberFmt.format(n) : '-';
}

export function formatDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
}

export function formatDateTime(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatCep(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits || '-';
}

export function formatDocument(value: unknown): string {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d || '-';
}

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

// Status técnicos (enums do banco, status de jobs/webhooks) -> rótulo em português + cor.
const STATUS: Record<string, [string, Tone]> = {
  created: ['Criado', 'neutral'],
  ready_for_quote: ['Aguardando cotação', 'warning'],
  quoted: ['Cotado', 'info'],
  dispatched: ['Despachado', 'info'],
  in_transit: ['Em trânsito', 'warning'],
  out_for_delivery: ['Saiu para entrega', 'warning'],
  delivered: ['Entregue', 'success'],
  exception: ['Ocorrência', 'error'],
  returned: ['Devolvido', 'error'],
  canceled: ['Cancelado', 'neutral'],
  cancelled: ['Cancelado', 'neutral'],
  draft: ['Rascunho', 'warning'],
  published: ['Publicada', 'success'],
  archived: ['Arquivada', 'neutral'],
  pending: ['Pendente', 'warning'],
  processing: ['Processando', 'info'],
  processed: ['Processado', 'success'],
  success: ['Sucesso', 'success'],
  ok: ['Sucesso', 'success'],
  error: ['Erro', 'error'],
  failed: ['Falhou', 'error'],
  retry: ['Nova tentativa', 'warning'],
  rejected: ['Rejeitado', 'error'],
  active: ['Ativo', 'success'],
  inactive: ['Inativo', 'neutral'],
  conciliado: ['Conciliado', 'success'],
  pago_acima: ['Pago acima', 'error'],
  pago_abaixo: ['Pago abaixo', 'warning'],
  sem_cte: ['Sem CT-e', 'neutral'],
  sem_cotacao: ['Sem cotação', 'warning'],
  venda: ['Venda', 'info'],
  remessa: ['Remessa (triangulação)', 'warning'],
  outra: ['Outra', 'neutral']
};

// Rótulos que já chegam em português (ex.: "Ativa", "Revogada") mantêm o texto e só ganham a cor.
const PT_TONES: Record<string, Tone> = {
  ativa: 'success', ativo: 'success', aprovado: 'success', selecionada: 'success', conectada: 'success', conectado: 'success', publicada: 'success', entregue: 'success',
  pendente: 'warning', rascunho: 'warning', sandbox: 'warning', 'em desenvolvimento': 'warning', 'produção': 'success', 'disponível': 'neutral', 'em trânsito': 'warning', 'não implementada': 'warning',
  inativa: 'neutral', inativo: 'neutral', revogada: 'error', erro: 'error', desconectada: 'error', desconectado: 'error', 'não conectado': 'neutral',
  'válido': 'success', vencido: 'error', 'sem certificado': 'neutral', 'sem vínculo': 'warning', 'sem pedido': 'warning', recebido: 'success', ignorado: 'neutral', 'sucesso com falhas': 'warning'
};

export function statusInfo(status: unknown): { label: string; tone: Tone } {
  const raw = String(status ?? '').trim();
  if (!raw) return { label: '-', tone: 'neutral' };
  const known = STATUS[raw.toLowerCase()];
  if (known) return { label: known[0], tone: known[1] };
  return { label: raw, tone: PT_TONES[raw.toLowerCase()] || 'neutral' };
}

export const ORDER_STATUS_OPTIONS = ['READY_FOR_QUOTE', 'QUOTED', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'RETURNED', 'CANCELED'];

const CHANNELS: Record<string, string> = { shopee: 'Shopee', tiny: 'Tiny ERP', magalu: 'Magalu', manual: 'Manual', mercadolivre: 'Mercado Livre', site: 'Site próprio', amazon: 'Amazon', shein: 'Shein', tiktok: 'TikTok Shop', americanas: 'Americanas' };
export function channelLabel(channel: unknown): string {
  const c = String(channel || '').toLowerCase();
  return CHANNELS[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : '-');
}

// Tipos de job de sincronização / ações de auditoria -> descrição legível.
const EVENT_LABELS: Record<string, string> = {
  tiny_import_orders: 'Importação de pedidos (Tiny)',
  tiny_status_sync: 'Atualização de status (Tiny)',
  tiny_import_products: 'Importação de produtos (Tiny)',
  tiny_sync: 'Sincronização Tiny',
  erp_connection: 'Conexão com ERP',
  shopee_sync: 'Sincronização Shopee',
  shopee_dispatch: 'Despacho na Shopee',
  tiny: 'Tiny ERP',
  magalu: 'Magalu',
  shopee: 'Shopee',
  sync: 'Sincronização',
  manual_quote: 'Cotação manual',
  automatic_quote: 'Cotação automática',
  tiny_import: 'Importação Tiny',
  create_shipment: 'Criação de embarque',
  import_draft: 'Importação de tabela',
  sefaz_sync: 'Consulta de CT-es na SEFAZ',
  upload: 'Envio',
  link: 'Vínculo',
  unlink: 'Remoção de vínculo',
  cte: 'CT-e',
  company_certificate: 'Certificado digital',
  order_invoice: 'Nota fiscal',
  manual_dispatch: 'Despacho manual',
  manual_tracking: 'Atualização manual de rastreio',
  carrier_mapping: 'De-para de transportadora',
  integration_issue: 'Pendência de integração',
  discard: 'Descarte',
  shopee_invoice: 'Envio de NF à Shopee',
  tracking_webhook: 'Evento de rastreio',
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
  publish: 'Publicação',
  rollback: 'Reversão',
  import: 'Importação',
  order: 'Pedido',
  shipment: 'Embarque',
  quote_request: 'Cotação',
  tracking_event: 'Rastreio',
  freight_table: 'Tabela de frete',
  freight_table_version: 'Versão de tabela',
  shipping_rule: 'Regra de frete',
  api_credential: 'Chave de API',
  carrier: 'Transportadora',
  company: 'Empresa',
  product: 'Produto',
  recipient: 'Destinatário'
};
export function eventLabel(key: unknown): string {
  const k = String(key || '');
  return EVENT_LABELS[k] || EVENT_LABELS[k.toLowerCase()] || k.replace(/_/g, ' ') || '-';
}

const ROLES: Record<string, string> = {
  admin: 'Administrador',
  operador: 'Operador logístico',
  operador_logistico: 'Operador logístico',
  financeiro: 'Financeiro',
  integracao: 'Integração',
  analista_integracao: 'Integração',
  visualizador: 'Somente leitura'
};
export function roleLabel(role: unknown): string {
  return ROLES[String(role || '').toLowerCase()] || String(role || '-');
}

export function shortId(id: unknown): string {
  return String(id || '').slice(0, 8) || '-';
}

// Resume os dados de um registro de auditoria em texto legível (sem JSON cru).
const DATA_LABELS: Record<string, string> = {
  count: 'Quantidade', synced: 'Pedidos sincronizados', quoted: 'Pedidos cotados', shops: 'Lojas', trackingCode: 'Rastreio',
  resultCount: 'Opções de frete', tracking_code: 'Rastreio', status: 'Situação', name: 'Nome', label: 'Nome', role: 'Perfil',
  rotas_detectadas: 'Rotas', taxas_detectadas: 'Taxas', erros_detectados: 'Erros', tipo_carga_detectados: 'Tipos de carga', weightKg: 'Peso (kg)'
};
export function summarizeData(data: unknown): string {
  if (!data || typeof data !== 'object') return '-';
  const parts = Object.entries(data as Record<string, unknown>)
    .filter(([k, v]) => DATA_LABELS[k] && v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${DATA_LABELS[k]}: ${k === 'status' ? statusInfo(v).label : k === 'role' ? roleLabel(v) : String(v)}`);
  return parts.length ? parts.slice(0, 4).join(' · ') : '-';
}
