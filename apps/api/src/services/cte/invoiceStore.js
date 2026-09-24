import { query } from '../../db.js';
import { HttpError } from '../../utils/router.js';
import { parseNfeXml } from './cteParser.js';
import { rematchCtesForOrder } from './cteStore.js';

// Dados mínimos a partir da chave de 44 dígitos (quando o ERP manda só a chave).
function fromKey(chave) {
  return { serie: String(Number(chave.slice(22, 25))), numero: String(Number(chave.slice(25, 34))), emitenteCnpj: chave.slice(6, 20) };
}

async function findOrder(accountId, ref = {}) {
  if (ref.orderId) {
    const r = await query('select id from app.orders where account_id = $1 and id = $2', [accountId, ref.orderId]);
    if (!r.rows[0]) throw new Error('Order not found');
    return r.rows[0].id;
  }
  const key = ref.orderExternalId || ref.orderNumber;
  if (!key) return null;
  const r = await query('select id from app.orders where account_id = $1 and (external_id = $2 or order_number = $2) limit 2', [accountId, String(key)]);
  if (r.rows.length !== 1) throw new HttpError(404, `Pedido "${key}" não encontrado.`);
  return r.rows[0].id;
}

// Grava uma NF-e (XML ou campos) e liga ao pedido. Retorna { id, orderId, kind, created, linkedBy }.
export async function saveInvoice({ accountId, xml = null, fields = null, kind = null, orderRef = {}, source = 'upload' }) {
  let nf;
  if (xml) nf = parseNfeXml(xml);
  else {
    const chave = String(fields?.chave || fields?.accessKey || '').replace(/\D/g, '');
    if (!/^\d{44}$/.test(chave)) throw new HttpError(400, 'Informe o XML da NF-e ou a chave de acesso com 44 dígitos.');
    nf = {
      chave, ...fromKey(chave),
      numero: fields.numero ? String(fields.numero) : fromKey(chave).numero,
      serie: fields.serie ? String(fields.serie) : fromKey(chave).serie,
      dataEmissao: fields.dataEmissao || null,
      valorTotal: fields.valorTotal ?? null,
      valorProdutos: fields.valorProdutos ?? null,
      cfop: fields.cfop || null,
      referencedKeys: Array.isArray(fields.referencedKeys) ? fields.referencedKeys.map((k) => String(k).replace(/\D/g, '')) : []
    };
  }

  let orderId = await findOrder(accountId, orderRef);
  let linkedBy = orderId ? 'informado' : null;
  let resolvedKind = kind;

  // Triangulação: a NF de remessa referencia a NF de venda que já está ligada a um pedido.
  if (!orderId && nf.referencedKeys?.length) {
    const r = await query('select order_id from app.order_invoices where account_id = $1 and chave = any($2::text[]) and order_id is not null limit 1', [accountId, nf.referencedKeys]);
    if (r.rows[0]) { orderId = r.rows[0].order_id; linkedBy = 'nf_referenciada'; resolvedKind = resolvedKind || 'remessa'; }
  }
  // Número do pedido informado na própria NF (xPed).
  if (!orderId && nf.pedidoReferencia) {
    const r = await query('select id from app.orders where account_id = $1 and (order_number = $2 or external_id = $2) limit 2', [accountId, nf.pedidoReferencia]);
    if (r.rows.length === 1) { orderId = r.rows[0].id; linkedBy = 'numero_pedido'; }
  }
  resolvedKind = resolvedKind || 'venda';

  const { rows } = await query(
    `insert into app.order_invoices(account_id, order_id, kind, chave, numero, serie, data_emissao, emitente_cnpj, emitente_nome, emitente_uf,
       destinatario_documento, destinatario_nome, destino_uf, valor_total, valor_produtos, cfop, pedido_referencia, referenced_keys, source, xml)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     on conflict (account_id, chave) do update set
       order_id = coalesce(excluded.order_id, app.order_invoices.order_id),
       kind = case when $21::boolean then excluded.kind else app.order_invoices.kind end,
       valor_total = coalesce(excluded.valor_total, app.order_invoices.valor_total),
       valor_produtos = coalesce(excluded.valor_produtos, app.order_invoices.valor_produtos),
       xml = coalesce(excluded.xml, app.order_invoices.xml), updated_at = now()
     returning id, order_id, kind, (xmax = 0) as created`,
    [accountId, orderId, resolvedKind, nf.chave, nf.numero, nf.serie, nf.dataEmissao, nf.emitenteCnpj, nf.emitenteNome || null, nf.emitenteUf || null,
      nf.destinatarioDocumento || null, nf.destinatarioNome || null, nf.destinoUf || null, nf.valorTotal, nf.valorProdutos, nf.cfop || null,
      nf.pedidoReferencia || null, nf.referencedKeys || [], source, xml, Boolean(kind)]
  );
  const row = rows[0];
  // Frete destacado na NF de venda: usado como frete cobrado quando o pedido ainda não tem esse valor.
  if (row.order_id && row.kind === 'venda' && nf.valorFrete > 0) {
    await query('update app.orders set shipping_amount = $3, updated_at = now() where account_id = $1 and id = $2 and shipping_amount is null', [accountId, row.order_id, nf.valorFrete]);
  }
  if (row.order_id) await afterInvoiceLinked(accountId, row.order_id, nf.chave);
  return { id: row.id, orderId: row.order_id, kind: row.kind, created: row.created, linkedBy, chave: nf.chave, numero: nf.numero };
}

// Quando uma NF ganha pedido: adota as NFs de remessa que a referenciam e revisa os CT-es sem vínculo.
export async function afterInvoiceLinked(accountId, orderId, chave) {
  await query(
    `update app.order_invoices set order_id = $2, kind = case when kind = 'venda' then 'remessa' else kind end, updated_at = now()
     where account_id = $1 and order_id is null and $3 = any(referenced_keys)`,
    [accountId, orderId, chave]
  );
  return rematchCtesForOrder(accountId, orderId);
}
