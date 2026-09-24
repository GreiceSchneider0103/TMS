import { query } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { HttpError } from '../utils/router.js';
import { logAudit } from '../services/audit.js';
import { saveInvoice, afterInvoiceLinked } from '../services/cte/invoiceStore.js';

const WRITE_ROLES = ['admin', 'operador_logistico', 'financeiro', 'analista_integracao'];
const READ_ROLES = ['admin', 'operador_logistico', 'financeiro', 'visualizador', 'analista_integracao'];
const KINDS = ['venda', 'remessa', 'outra'];

function kindOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const k = String(value).toLowerCase();
  if (!KINDS.includes(k)) throw new HttpError(400, 'Tipo de NF inválido: use venda, remessa ou outra.');
  return k;
}

export function registerInvoiceRoutes(app) {
  // Recebe NF-e do ERP/marketplace ou envio manual. Aceita o XML (xmlBase64) ou só a chave e dados básicos.
  // O pedido pode ser informado por orderId, orderExternalId ou orderNumber; sem isso, a API tenta ligar
  // pela NF referenciada (triangulação) ou pelo número do pedido escrito na NF (xPed).
  app.post('/invoices', requireAnyRole(WRITE_ROLES, async ({ ctx, body }) => {
    const xml = body.xmlBase64 ? Buffer.from(String(body.xmlBase64), 'base64').toString('utf8') : body.xml || null;
    const result = await saveInvoice({
      accountId: ctx.accountId,
      xml,
      fields: xml ? null : body,
      kind: kindOf(body.kind),
      orderRef: { orderId: body.orderId, orderExternalId: body.orderExternalId, orderNumber: body.orderNumber },
      source: body.source || (ctx.authMode === 'api_key' && ctx.role === 'analista_integracao' ? 'integracao' : 'upload')
    });
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'order_invoice', entityId: result.id, action: result.created ? 'create' : 'update', afterData: { numero: result.numero, kind: result.kind, orderId: result.orderId }, correlationId: ctx.correlationId });
    return { ...result, correlationId: ctx.correlationId };
  }));

  // Vários XMLs de uma vez (tela de upload).
  app.post('/invoices/import', requireAnyRole(WRITE_ROLES, async ({ ctx, body }) => {
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) throw new HttpError(400, 'Envie ao menos um arquivo XML de NF-e.');
    const summary = { imported: 0, updated: 0, linked: 0, unlinked: 0, errors: [] };
    for (const f of files.slice(0, 500)) {
      try {
        const res = await saveInvoice({
          accountId: ctx.accountId,
          xml: Buffer.from(String(f.contentBase64 || ''), 'base64').toString('utf8'),
          kind: kindOf(body.kind),
          orderRef: { orderId: body.orderId },
          source: 'upload'
        });
        if (res.created) summary.imported += 1; else summary.updated += 1;
        if (res.orderId) summary.linked += 1; else summary.unlinked += 1;
      } catch (error) {
        summary.errors.push(`${f.fileName || 'arquivo'}: ${error.message}`);
      }
    }
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'order_invoice', entityId: ctx.accountId, action: 'import', afterData: { count: summary.imported, linked: summary.linked }, correlationId: ctx.correlationId });
    return { ...summary, correlationId: ctx.correlationId };
  }));

  app.get('/invoices', requireAnyRole(READ_ROLES, async ({ ctx, query: qs }) => {
    const { rows } = await query(
      `select oi.id, oi.order_id, oi.kind, oi.chave, oi.numero, oi.serie, oi.data_emissao, oi.emitente_cnpj, oi.emitente_nome, oi.emitente_uf,
              oi.destinatario_nome, oi.destino_uf, oi.valor_total, oi.cfop, oi.referenced_keys, oi.source, oi.shopee_sent_at, oi.created_at,
              o.order_number, o.channel,
              exists (select 1 from app.ctes x where x.account_id = oi.account_id and oi.chave = any(x.nfe_chaves)) as has_cte
       from app.order_invoices oi
       left join app.orders o on o.id = oi.order_id
       where oi.account_id = $1 and ($2::boolean is not true or oi.order_id is null) and ($3::uuid is null or oi.order_id = $3)
       order by oi.data_emissao desc nulls last, oi.created_at desc limit 500`,
      [ctx.accountId, qs.unlinked === 'true', qs.orderId || null]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.get('/orders/:id/invoices', requireAnyRole(READ_ROLES, async ({ ctx, params }) => {
    const { rows } = await query(
      `select oi.id, oi.kind, oi.chave, oi.numero, oi.serie, oi.data_emissao, oi.emitente_cnpj, oi.emitente_nome, oi.emitente_uf, oi.destino_uf,
              oi.valor_total, oi.referenced_keys, oi.source, oi.shopee_sent_at,
              (select string_agg(x.numero, ', ') from app.ctes x where x.account_id = oi.account_id and oi.chave = any(x.nfe_chaves)) as cte_numbers
       from app.order_invoices oi where oi.account_id = $1 and oi.order_id = $2
       order by case oi.kind when 'venda' then 0 when 'remessa' then 1 else 2 end, oi.data_emissao`,
      [ctx.accountId, params.id]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  // Liga/desliga uma NF de um pedido ou muda o tipo (venda / remessa de triangulação / outra).
  app.patch('/invoices/:id', requireAnyRole(WRITE_ROLES, async ({ ctx, params, body }) => {
    const current = await query('select id, chave, order_id from app.order_invoices where account_id = $1 and id = $2', [ctx.accountId, params.id]);
    if (!current.rows[0]) throw new HttpError(404, 'Nota fiscal não encontrada.');
    let orderId = current.rows[0].order_id;
    if (body.orderId !== undefined) {
      orderId = body.orderId || null;
      if (orderId) {
        const o = await query('select id from app.orders where account_id = $1 and id = $2', [ctx.accountId, orderId]);
        if (!o.rows[0]) throw new Error('Order not found');
      }
    }
    const { rows } = await query(
      `update app.order_invoices set order_id = $3, kind = coalesce($4, kind), updated_at = now() where account_id = $1 and id = $2 returning id, order_id, kind`,
      [ctx.accountId, params.id, orderId, kindOf(body.kind)]
    );
    const rematched = rows[0].order_id ? await afterInvoiceLinked(ctx.accountId, rows[0].order_id, current.rows[0].chave) : 0;
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'order_invoice', entityId: params.id, action: 'update', afterData: { orderId: rows[0].order_id, kind: rows[0].kind }, correlationId: ctx.correlationId });
    return { ...rows[0], ctesLinked: rematched, correlationId: ctx.correlationId };
  }));

  app.delete('/invoices/:id', requireAnyRole(['admin', 'operador_logistico', 'financeiro'], async ({ ctx, params }) => {
    const { rows } = await query('delete from app.order_invoices where account_id = $1 and id = $2 returning id', [ctx.accountId, params.id]);
    if (!rows[0]) throw new HttpError(404, 'Nota fiscal não encontrada.');
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'order_invoice', entityId: params.id, action: 'delete', correlationId: ctx.correlationId });
    return { deleted: true, correlationId: ctx.correlationId };
  }));
}
