import crypto from 'node:crypto';
import { query, runWithDbContext } from '../../db.js';
import { HttpError } from '../../utils/router.js';
import { encryptSecret, decryptSecret } from '../cte/secretBox.js';
import { saveInvoice } from '../cte/invoiceStore.js';
import { processOrderIntake } from '../orderIntake.js';
import { recordIssue, resolveIssues } from '../integrationIssues.js';
import { logSyncJob } from '../audit.js';
import { TinyV3Client, requestToken } from './tinyV3Client.js';
import { mapTinyOrder, mapTinyProduct, extractInvoiceXml, DEFAULT_IMPORT_SITUACOES, STATUS_TO_SITUACAO } from './tinyMapper.js';

export const DEFAULT_TINY_SETTINGS = {
  importOrders: true, // baixar pedidos de venda
  importSituacoes: DEFAULT_IMPORT_SITUACOES, // situações do pedido que entram no TMS
  daysBack: 15, // janela de busca (data do pedido)
  importProducts: true, // cadastrar produtos novos que aparecem nos pedidos
  syncMeasures: false, // atualizar peso/medidas de produtos já cadastrados com os dados do Tiny
  importInvoices: true, // baixar o XML da NF de venda emitida no Tiny
  updateStatus: true, // enviar despacho/entrega para a situação do pedido no Tiny
  autoSync: true, // sincronizar sozinho de tempos em tempos
  companyId: null // empresa dona dos produtos importados
};

const decrypt = (v) => (v ? decryptSecret(v).toString('utf8') : null);

export async function loadTinyConnection(accountId) {
  const { rows } = await query("select * from app.erp_connections where account_id = $1 and provider = 'tiny'", [accountId]);
  return rows[0] || null;
}

export function connectionSettings(conn) {
  return { ...DEFAULT_TINY_SETTINGS, ...(conn?.settings || {}) };
}

// Estado OAuth aleatório: identifica a conta no retorno do Tiny sem expor o accountId na URL.
export async function createOAuthState(accountId) {
  const state = crypto.randomBytes(24).toString('hex');
  await query(
    `update app.erp_connections set oauth_state = $2, oauth_state_expires_at = now() + interval '15 minutes', updated_at = now()
     where account_id = $1 and provider = 'tiny'`,
    [accountId, state]
  );
  return state;
}

export async function completeOAuth({ state, code, redirectUri }) {
  const { rows } = await query(
    "select * from app.erp_connections where provider = 'tiny' and oauth_state = $1 and oauth_state_expires_at > now()",
    [state]
  );
  const conn = rows[0];
  if (!conn) throw new HttpError(400, 'Autorização expirada ou inválida. Volte ao TMS e clique em "Autorizar no Tiny" de novo.');
  try {
    const tokens = await requestToken({ clientId: conn.client_id, clientSecret: decrypt(conn.client_secret_encrypted), code, redirectUri });
    await saveTokens(conn.id, tokens, { connected: true });
    return conn.account_id;
  } catch (error) {
    await query("update app.erp_connections set status = 'erro', last_error = $2, oauth_state = null, updated_at = now() where id = $1", [conn.id, error.message]);
    throw error;
  }
}

async function saveTokens(connectionId, tokens, { connected = false } = {}) {
  await query(
    `update app.erp_connections set access_token_encrypted = $2, refresh_token_encrypted = $3, access_token_expires_at = $4,
       refresh_token_expires_at = coalesce($5, refresh_token_expires_at), status = 'conectado', last_error = null,
       oauth_state = case when $6 then null else oauth_state end, connected_at = case when $6 then now() else connected_at end, updated_at = now()
     where id = $1`,
    [connectionId, encryptSecret(tokens.accessToken), tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      tokens.expiresAt.toISOString(), tokens.refreshExpiresAt ? tokens.refreshExpiresAt.toISOString() : null, connected]
  );
}

// Cliente autenticado da conta. Renova o token 5 min antes de expirar (ou quando o Tiny devolve 401).
export async function getTinyClient(accountId, { fetchImpl } = {}) {
  let conn = await loadTinyConnection(accountId);
  if (!conn || !conn.access_token_encrypted) throw new HttpError(409, 'O Tiny ainda não está conectado. Abra Configurações > Tiny ERP e clique em "Autorizar no Tiny".');
  const getToken = async ({ forceRefresh = false } = {}) => {
    const expiresIn = new Date(conn.access_token_expires_at).getTime() - Date.now();
    if (!forceRefresh && expiresIn > 5 * 60 * 1000) return decrypt(conn.access_token_encrypted);
    try {
      const tokens = await requestToken({ clientId: conn.client_id, clientSecret: decrypt(conn.client_secret_encrypted), refreshToken: decrypt(conn.refresh_token_encrypted) }, fetchImpl);
      await saveTokens(conn.id, tokens);
      conn = await loadTinyConnection(accountId);
      return tokens.accessToken;
    } catch (error) {
      await query("update app.erp_connections set status = 'erro', last_error = $2, updated_at = now() where id = $1", [conn.id, `Sessão do Tiny expirou: autorize de novo. (${error.message})`]);
      throw new HttpError(401, 'A autorização do Tiny expirou. Abra Configurações > Tiny ERP e clique em "Autorizar no Tiny" de novo.');
    }
  };
  return { client: new TinyV3Client({ getToken, ...(fetchImpl ? { fetchImpl } : {}) }), conn, settings: connectionSettings(conn) };
}

const ymd = (d) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10); // data em Brasília

// Baixa os pedidos do Tiny nas situações configuradas e passa cada um pelo fluxo de entrada (de-para, CEP, cotação).
export async function syncTinyOrders({ accountId, correlationId = null, daysBack = null, maxOrders = 300, fetchImpl } = {}) {
  const { client, conn, settings } = await getTinyClient(accountId, { fetchImpl });
  const days = Math.min(90, Math.max(1, Number(daysBack || settings.daysBack) || 15));
  const since = new Date(Date.now() - days * 86400 * 1000);
  const result = { found: 0, imported: 0, updated: 0, skipped: 0, quoted: 0, invoices: 0, products: 0, errors: [] };

  const listed = [];
  const situacoes = Array.isArray(settings.importSituacoes) && settings.importSituacoes.length ? settings.importSituacoes : DEFAULT_IMPORT_SITUACOES;
  for (const situacao of situacoes) {
    const items = await client.listAll(client.listOrders, { situacao, dataInicial: ymd(since), dataFinal: ymd(new Date()), orderBy: 'desc' }, { maxItems: maxOrders });
    listed.push(...items);
  }
  const unique = [...new Map(listed.filter((i) => i?.id).map((i) => [String(i.id), i])).values()].slice(0, maxOrders);
  result.found = unique.length;

  // Pula pedidos já importados que não mudaram de situação no Tiny.
  const known = new Map((await query(
    "select raw_payload->>'tiny_order_id' as tiny_id, raw_payload->>'tiny_situacao' as situacao from app.orders where account_id = $1 and raw_payload ? 'tiny_order_id' and raw_payload->>'tiny_order_id' = any($2::text[])",
    [accountId, unique.map((i) => String(i.id))]
  )).rows.map((r) => [r.tiny_id, r.situacao]));

  for (const item of unique) {
    const id = String(item.id);
    const listedSituacao = item.situacao?.codigo ?? item.situacao;
    if (known.has(id) && String(known.get(id)) === String(listedSituacao)) { result.skipped += 1; continue; }
    try {
      const r = await importTinyOrder({ accountId, client, settings, tinyOrderId: id });
      result[r.created ? 'imported' : 'updated'] += 1;
      if (r.quoted) result.quoted += 1;
      if (r.invoice) result.invoices += 1;
      result.products += r.products;
    } catch (error) {
      result.errors.push({ tinyOrderId: id, message: error.message });
      await recordIssue({ accountId, source: 'tiny', reason: 'erro_integracao', externalRef: String(item.numeroPedido || id), message: `Pedido Tiny ${item.numeroPedido || id}: ${error.message}`, details: { tinyOrderId: id } });
    }
  }

  await query('update app.erp_connections set last_order_sync_at = now(), updated_at = now() where id = $1', [conn.id]);
  await logSyncJob({ accountId, kind: 'tiny_import_orders', status: result.errors.length && !result.imported && !result.updated ? 'error' : 'success', payload: { days, situacoes }, response: { ...result, errors: result.errors.slice(0, 50) }, correlationId });
  return result;
}

// Importa (ou atualiza) um pedido do Tiny pelo id. Usado pela sincronização e pelos webhooks.
export async function importTinyOrder({ accountId, client, settings, tinyOrderId, respectSituacoes = false }) {
  const detail = await client.getOrder(tinyOrderId);
  if (respectSituacoes) {
    // Webhook: pedido novo só entra se estiver numa situação configurada; os já importados sempre atualizam.
    const allowed = (settings.importSituacoes || DEFAULT_IMPORT_SITUACOES).map(Number);
    const cod = Number(detail?.situacao?.codigo ?? detail?.situacao);
    const known = await query("select 1 from app.orders where account_id = $1 and raw_payload->>'tiny_order_id' = $2 limit 1", [accountId, String(tinyOrderId)]);
    if (!known.rows[0] && !allowed.includes(cod)) return { skipped: true, reason: 'situacao', created: false, quoted: false, products: 0 };
  }
  const productsCreated = await ensureProducts({ accountId, client, settings, items: detail?.itens || [] });
  const measures = await loadMeasures(accountId, (detail?.itens || []).map((it) => it?.produto?.sku).filter(Boolean));
  const m = mapTinyOrder(detail, { productMeasures: measures });

  const { rows } = await query(
    `insert into app.orders(account_id, external_id, order_number, channel, total_amount, invoice_amount, status, raw_payload, sold_at,
       promised_delivery_date, marketplace_carrier, marketplace_service, shipping_amount)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (account_id, external_id) do update set
       total_amount = excluded.total_amount,
       invoice_amount = excluded.invoice_amount,
       status = case when app.orders.status in ('CREATED','READY_FOR_QUOTE') and excluded.status in ('CREATED','READY_FOR_QUOTE','CANCELED') then excluded.status else app.orders.status end,
       raw_payload = app.orders.raw_payload || excluded.raw_payload,
       sold_at = coalesce(app.orders.sold_at, excluded.sold_at),
       promised_delivery_date = coalesce(excluded.promised_delivery_date, app.orders.promised_delivery_date),
       marketplace_carrier = coalesce(excluded.marketplace_carrier, app.orders.marketplace_carrier),
       marketplace_service = coalesce(excluded.marketplace_service, app.orders.marketplace_service),
       shipping_amount = coalesce(app.orders.shipping_amount, excluded.shipping_amount),
       updated_at = now()
     returning id, (xmax = 0) as created`,
    [accountId, m.externalId, m.orderNumber, m.channel, m.totalAmount, m.invoiceAmount, m.status, JSON.stringify(m.rawPayload), m.soldAt,
      m.promisedDeliveryDate, m.marketplaceCarrier, m.marketplaceService, m.shippingAmount]
  );
  const order = rows[0];
  await resolveIssues({ accountId, orderId: order.id, reasons: ['erro_integracao'] });

  let invoice = null;
  if (settings.importInvoices && m.invoiceId) {
    try {
      const xml = extractInvoiceXml(await client.getInvoiceXml(m.invoiceId));
      if (xml) invoice = await saveInvoice({ accountId, xml, kind: 'venda', orderRef: { orderId: order.id }, source: 'tiny' });
    } catch (error) {
      // NF ainda não autorizada ou sem XML: tenta de novo na próxima sincronização.
      await recordIssue({ accountId, source: 'tiny', reason: 'erro_integracao', orderId: order.id, externalRef: m.orderNumber, message: `NF do pedido ${m.orderNumber} não baixada: ${error.message}`, details: { invoiceId: m.invoiceId } });
    }
  }

  const intake = m.status === 'CANCELED' ? { quoted: false } : await processOrderIntake({ accountId, orderId: order.id, source: 'tiny' });
  return { orderId: order.id, created: order.created, quoted: Boolean(intake.quoted), invoice, products: productsCreated };
}

async function loadMeasures(accountId, skus) {
  const map = new Map();
  if (!skus.length) return map;
  const { rows } = await query(
    `select p.sku_internal, p.sku_external, pl.weight_kg, pl.length_cm, pl.width_cm, pl.height_cm
     from app.products p join app.product_logistics pl on pl.product_id = p.id
     where p.account_id = $1 and p.deleted_at is null and (p.sku_internal = any($2::text[]) or p.sku_external = any($2::text[]))`,
    [accountId, skus]
  );
  for (const r of rows) {
    const m = { weightKg: Number(r.weight_kg), lengthCm: Number(r.length_cm), widthCm: Number(r.width_cm), heightCm: Number(r.height_cm) };
    for (const k of [r.sku_internal, r.sku_external]) if (k && !map.has(k)) map.set(k, m);
  }
  return map;
}

// Cadastra no TMS os produtos do pedido que ainda não existem (e atualiza medidas, se configurado).
async function ensureProducts({ accountId, client, settings, items }) {
  if (!settings.importProducts && !settings.syncMeasures) return 0;
  let created = 0;
  for (const it of items) {
    const p = it?.produto || {};
    if (!p.id || !p.sku) continue;
    const existing = await query('select id from app.products where account_id = $1 and deleted_at is null and (sku_internal = $2 or sku_external = $2) limit 1', [accountId, String(p.sku)]);
    if (existing.rows[0] && !settings.syncMeasures) continue;
    if (!existing.rows[0] && !settings.importProducts) continue;
    try {
      const r = await upsertTinyProduct({ accountId, settings, product: mapTinyProduct(await client.getProduct(p.id)) });
      if (r.created) created += 1;
    } catch {
      // Produto sem permissão/removido no Tiny: o pedido segue com as medidas padrão.
    }
  }
  return created;
}

export async function upsertTinyProduct({ accountId, settings, product }) {
  if (!product.sku) return { skipped: true };
  const companyId = settings.companyId || null;
  const existing = await query(
    'select id from app.products where account_id = $1 and deleted_at is null and (sku_internal = $2 or sku_external = $2) order by (company_id is not distinct from $3) desc limit 1',
    [accountId, product.sku, companyId]
  );
  let productId = existing.rows[0]?.id;
  let created = false;
  if (!productId) {
    const ins = await query('insert into app.products(account_id, company_id, sku_internal, sku_external, name, category) values($1,$2,$3,$4,$5,$6) returning id',
      [accountId, companyId, product.sku, product.tinyId ? `tiny:${product.tinyId}` : null, product.name, product.category]);
    productId = ins.rows[0].id;
    created = true;
  } else if (!settings.syncMeasures) {
    return { productId, created: false, measures: false };
  }
  const hasMeasures = product.weightKg > 0;
  if (hasMeasures && (created || settings.syncMeasures)) {
    await query(
      `insert into app.product_logistics(product_id, account_id, weight_kg, length_cm, width_cm, height_cm, cubing_factor, restrictions)
       values($1,$2,$3,$4,$5,$6,300,'{}'::jsonb)
       on conflict(product_id) do update set weight_kg = excluded.weight_kg, length_cm = excluded.length_cm, width_cm = excluded.width_cm, height_cm = excluded.height_cm, updated_at = now()`,
      [productId, accountId, product.weightKg, product.lengthCm || 10, product.widthCm || 10, product.heightCm || 10]
    );
  }
  return { productId, created, measures: hasMeasures };
}

// Importa o catálogo de produtos do Tiny (ativos), com peso e medidas.
export async function syncTinyProducts({ accountId, correlationId = null, maxProducts = 1000, fetchImpl } = {}) {
  const { client, conn, settings } = await getTinyClient(accountId, { fetchImpl });
  const list = await client.listAll(client.listProducts, { situacao: 'A' }, { maxItems: maxProducts });
  const result = { found: list.length, created: 0, updated: 0, withoutMeasures: 0, errors: [] };
  const effective = { ...settings, importProducts: true };
  for (const item of list) {
    try {
      const existing = item.sku ? await query('select 1 from app.products where account_id = $1 and deleted_at is null and (sku_internal = $2 or sku_external = $2) limit 1', [accountId, String(item.sku)]) : { rows: [] };
      if (existing.rows[0] && !settings.syncMeasures) continue;
      const product = mapTinyProduct(await client.getProduct(item.id));
      const r = await upsertTinyProduct({ accountId, settings: effective, product });
      if (r.skipped) continue;
      if (r.created) result.created += 1; else result.updated += 1;
      if (!r.measures) result.withoutMeasures += 1;
    } catch (error) {
      result.errors.push({ tinyProductId: String(item.id), message: error.message });
    }
  }
  await query('update app.erp_connections set last_product_sync_at = now(), updated_at = now() where id = $1', [conn.id]);
  await logSyncJob({ accountId, kind: 'tiny_import_products', status: 'success', payload: {}, response: { ...result, errors: result.errors.slice(0, 50) }, correlationId });
  return result;
}

// Envia ao Tiny o despacho/entrega do pedido (quando "Atualizar situação no Tiny" está ligado).
// Nunca bloqueia o fluxo do TMS: falhas viram pendência de integração.
export async function pushTinyStatus({ accountId, orderId, status, trackingCode = null, carrierName = null }) {
  try {
    const { rows } = await query("select order_number, raw_payload->>'tiny_order_id' as tiny_id from app.orders where account_id = $1 and id = $2", [accountId, orderId]);
    const tinyId = rows[0]?.tiny_id;
    const situacao = STATUS_TO_SITUACAO[status];
    if (!tinyId || situacao === undefined) return { skipped: true };
    const conn = await loadTinyConnection(accountId);
    if (!conn?.access_token_encrypted || conn.status !== 'conectado' || !connectionSettings(conn).updateStatus) return { skipped: true };

    const { client } = await getTinyClient(accountId);
    if (status === 'DISPATCHED' && trackingCode) {
      await client.updateOrderDispatch(tinyId, { codigoRastreamento: trackingCode, ...(carrierName ? { transportador: { nome: carrierName } } : {}) }).catch(() => null);
    }
    await client.updateOrderStatus(tinyId, situacao);
    await query("update app.orders set raw_payload = raw_payload || jsonb_build_object('tiny_situacao', $3::int), updated_at = now() where account_id = $1 and id = $2", [accountId, orderId, situacao]);
    await logSyncJob({ accountId, kind: 'tiny_status_sync', status: 'success', payload: { orderId, status, situacao }, externalRef: tinyId });
    return { ok: true, situacao };
  } catch (error) {
    await recordIssue({ accountId, source: 'tiny', reason: 'erro_integracao', orderId, message: `Situação não atualizada no Tiny (${status}): ${error.message}`, details: { status } }).catch(() => null);
    await logSyncJob({ accountId, kind: 'tiny_status_sync', status: 'error', payload: { orderId, status }, error: error.message }).catch(() => null);
    return { ok: false, error: error.message };
  }
}

// Sincronização automática: a cada 30 min (enquanto a API está acordada), para contas conectadas com autoSync.
let timer = null;
let running = false;
export function startTinyScheduler() {
  if (timer || String(process.env.TINY_SCHEDULER_ENABLED || 'true') === 'false') return;
  const everyMs = Math.max(5, Number(process.env.TINY_SYNC_MINUTES || 30)) * 60 * 1000;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Reserva atômica: marca a conta antes de sincronizar para não rodar duas vezes em paralelo.
      const { rows } = await query(
        `update app.erp_connections set last_order_sync_at = now()
         where provider = 'tiny' and status = 'conectado'
           and coalesce((settings->>'autoSync')::boolean, true) and coalesce((settings->>'importOrders')::boolean, true)
           and (last_order_sync_at is null or last_order_sync_at < now() - make_interval(secs => $1))
         returning account_id`,
        [Math.floor(everyMs / 1000) - 60]
      );
      for (const r of rows) {
        const ctx = { accountId: r.account_id, role: 'admin', correlationId: `tiny-auto-${Date.now()}`, userId: '00000000-0000-0000-0000-000000000000' };
        await runWithDbContext(ctx, () => syncTinyOrders({ accountId: r.account_id, correlationId: ctx.correlationId }))
          .catch((error) => console.error(JSON.stringify({ event: 'tiny_auto_sync_error', accountId: r.account_id, message: error.message })));
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'tiny_scheduler_error', message: error.message }));
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60 * 1000);
  timer = setInterval(tick, everyMs);
  timer.unref?.();
}
