import { parseDecimal } from '../units.js';

// Conversões puras (sem banco) entre os objetos da API v3 do Tiny e o formato do TMS.

// Situações do pedido de venda no Tiny v3.
export const TINY_SITUACAO = {
  ABERTA: 0, FATURADA: 1, CANCELADA: 2, APROVADA: 3, PREPARANDO_ENVIO: 4,
  ENVIADA: 5, ENTREGUE: 6, PRONTO_ENVIO: 7, DADOS_INCOMPLETOS: 8, NAO_ENTREGUE: 9
};

const SITUACAO_TO_STATUS = {
  0: 'CREATED', 8: 'CREATED', 3: 'READY_FOR_QUOTE', 4: 'READY_FOR_QUOTE', 1: 'READY_FOR_QUOTE', 7: 'READY_FOR_QUOTE',
  5: 'DISPATCHED', 6: 'DELIVERED', 2: 'CANCELED', 9: 'EXCEPTION'
};

// Status do envio no TMS -> situação a gravar no Tiny.
export const STATUS_TO_SITUACAO = { DISPATCHED: 5, IN_TRANSIT: 5, OUT_FOR_DELIVERY: 5, DELIVERED: 6, EXCEPTION: 9, RETURNED: 9 };

// Situações que o TMS importa por padrão (pedido aprovado, ainda não enviado).
export const DEFAULT_IMPORT_SITUACOES = [3, 4, 1, 7];

const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseDecimal(v);
  return Number.isFinite(n) ? n : null;
};
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v).trim());
const situacaoCode = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object') return situacaoCode(v.codigo ?? v.id ?? v.situacao);
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

// Nome do canal/e-commerce no Tiny -> canal do TMS.
export function channelFromTiny(order = {}) {
  const e = order.ecommerce || {};
  const name = String(e.canalVenda || e.nome || order.canalVenda || '').toLowerCase();
  if (/shopee/.test(name)) return 'shopee';
  if (/magalu|magazine/.test(name)) return 'magalu';
  if (/mercado\s*livre|mercadolivre|meli/.test(name)) return 'mercadolivre';
  if (/amazon/.test(name)) return 'amazon';
  if (/shein/.test(name)) return 'shein';
  if (/tiktok/.test(name)) return 'tiktok';
  if (/americanas|b2w/.test(name)) return 'americanas';
  if (/nuvemshop|shopify|tray|vtex|loja|site|woo/.test(name)) return 'site';
  return 'tiny';
}

// Data "AAAA-MM-DD" ou "AAAA-MM-DD HH:MM:SS" ou "DD/MM/AAAA" -> ISO (ou null).
export function tinyDate(v, { dateOnly = false } = {}) {
  const s = str(v);
  if (!s || /^0000/.test(s)) return null;
  let iso = s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
  if (br) iso = `${br[3]}-${br[2]}-${br[1]}${br[4] || ''}`;
  if (dateOnly) return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
  const d = new Date(/T|\s\d/.test(iso) ? iso.replace(' ', 'T') + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? '' : '-03:00') : `${iso.slice(0, 10)}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Pedido detalhado do Tiny (GET /pedidos/{id}) -> campos do app.orders.
export function mapTinyOrder(o = {}, { productMeasures = new Map() } = {}) {
  const tinyId = str(o.id);
  const e = o.ecommerce || {};
  const channel = channelFromTiny(o);
  const ecommerceNumber = str(e.numeroPedidoEcommerce || e.numeroPedidoCanalVenda);
  // Pedido de marketplace que também chega direto pela integração do canal: usa a mesma chave para não duplicar.
  const externalId = channel === 'shopee' && ecommerceNumber ? `shopee-${ecommerceNumber}` : `tiny-${tinyId}`;
  const addr = o.enderecoEntrega && (o.enderecoEntrega.cep || o.enderecoEntrega.municipio) ? o.enderecoEntrega : (o.cliente?.endereco || {});
  const items = Array.isArray(o.itens) ? o.itens : [];

  // Peso/medidas: soma dos produtos cadastrados (peso x quantidade; maior comprimento/largura e altura empilhada).
  let weight = 0; let length = 0; let width = 0; let height = 0; let measured = 0;
  const skus = [];
  for (const it of items) {
    const p = it.produto || {};
    const sku = str(p.sku || p.codigo);
    if (sku) skus.push(sku);
    const qty = num(it.quantidade) || 1;
    const m = productMeasures.get(sku) || productMeasures.get(str(p.id));
    if (m && m.weightKg > 0) {
      measured += 1;
      weight += m.weightKg * qty;
      length = Math.max(length, m.lengthCm || 0);
      width = Math.max(width, m.widthCm || 0);
      height += (m.heightCm || 0) * qty;
    }
  }
  const allMeasured = items.length > 0 && measured === items.length;
  const pesoPedido = num(o.pesoBruto ?? o.pesoLiquido ?? o.transportador?.pesoBruto);

  const t = o.transportador || {};
  const totalProdutos = num(o.valorTotalProdutos);
  const totalPedido = num(o.valorTotalPedido ?? o.valor ?? o.totalPedido);
  const situacao = situacaoCode(o.situacao);

  return {
    tinyId,
    externalId,
    orderNumber: ecommerceNumber && channel !== 'tiny' ? ecommerceNumber : str(o.numeroPedido ?? o.numero) || tinyId,
    channel,
    situacao,
    status: SITUACAO_TO_STATUS[situacao] || 'CREATED',
    totalAmount: totalPedido ?? totalProdutos ?? 0,
    invoiceAmount: totalProdutos ?? totalPedido ?? 0,
    shippingAmount: num(o.valorFrete),
    soldAt: tinyDate(o.dataCriacao || o.data),
    promisedDeliveryDate: tinyDate(o.dataPrevista, { dateOnly: true }),
    marketplaceCarrier: str(t.nome),
    marketplaceService: str(t.formaEnvio?.nome || t.formaFrete?.nome),
    trackingCode: str(t.codigoRastreamento),
    invoiceId: str(o.idNotaFiscal ?? o.notaFiscal?.id),
    rawPayload: {
      postal_code: digits(addr.cep) || null,
      state: str(addr.uf)?.toUpperCase() || null,
      city: str(addr.municipio || addr.cidade),
      recipient_name: str(o.cliente?.nome),
      recipient_document: digits(o.cliente?.cpfCnpj || o.cliente?.cpf_cnpj) || null,
      recipient_type: digits(o.cliente?.cpfCnpj || o.cliente?.cpf_cnpj).length === 14 ? 'PJ' : 'PF',
      weight_kg: allMeasured && weight > 0 ? Number(weight.toFixed(3)) : (pesoPedido && pesoPedido > 0 ? pesoPedido : 1),
      length_cm: allMeasured && length > 0 ? length : 10,
      width_cm: allMeasured && width > 0 ? width : 10,
      height_cm: allMeasured && height > 0 ? Number(height.toFixed(2)) : 10,
      measures_source: allMeasured ? 'produtos' : (pesoPedido ? 'pedido_tiny' : 'padrao'),
      skus,
      categories: [],
      items: items.map((it) => ({ sku: str(it.produto?.sku), name: str(it.produto?.descricao), quantity: num(it.quantidade), unitPrice: num(it.valorUnitario) })),
      tiny_order_id: tinyId,
      tiny_order_number: str(o.numeroPedido ?? o.numero),
      tiny_situacao: situacao,
      ecommerce_name: str(e.nome || e.canalVenda),
      ecommerce_order_number: ecommerceNumber,
      ...(num(o.valorFrete) !== null ? { shipping_amount_source: 'tiny_pedido' } : {})
    }
  };
}

// Produto detalhado do Tiny (GET /produtos/{id}) -> campos do cadastro de produtos.
export function mapTinyProduct(p = {}) {
  const d = p.dimensoes || {};
  const weight = num(d.pesoBruto) || num(d.pesoLiquido) || num(p.pesoBruto) || num(p.pesoLiquido);
  return {
    tinyId: str(p.id),
    sku: str(p.sku || p.codigo),
    name: str(p.descricao || p.nome) || str(p.sku) || 'Produto sem nome',
    category: str(p.categoria?.nome || p.categoria?.caminhoCompleto),
    gtin: str(p.gtin),
    active: !p.situacao || String(p.situacao).toUpperCase() === 'A',
    weightKg: weight && weight > 0 ? weight : null,
    lengthCm: num(d.comprimento ?? p.comprimento),
    widthCm: num(d.largura ?? p.largura),
    heightCm: num(d.altura ?? p.altura)
  };
}

// Resposta do GET /notas/{id}/xml -> XML como texto.
export function extractInvoiceXml(res) {
  if (!res) return null;
  if (typeof res === 'string') return res.trim().startsWith('<') ? res : null;
  const x = res.xmlNfe || res.xml_nfe || res.xml || res.raw;
  return typeof x === 'string' && x.trim().startsWith('<') ? x : null;
}
