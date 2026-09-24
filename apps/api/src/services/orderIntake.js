import { query } from '../db.js';
import { createAndCalculateQuote, hashRequest } from '../routes/quotes.js';
import { resolveCarrierMapping } from './carrierMapping.js';
import { recordIssue, resolveIssues } from './integrationIssues.js';

// Processa um pedido recebido de um canal: aplica o de-para da transportadora, valida o destino
// e cota o frete. Cada problema vira uma pendência com motivo (ou é resolvida quando some).
export async function processOrderIntake({ accountId, orderId, source }) {
  const { rows } = await query('select * from app.orders where account_id = $1 and id = $2', [accountId, orderId]);
  const order = rows[0];
  if (!order) throw new Error('Order not found');
  const p = order.raw_payload || {};
  const ref = order.order_number || order.external_id;
  const result = { orderId, ignored: false, quoted: false, issues: [] };
  let chosenCarrierId = null;

  // 1) Transportadora informada pelo canal -> de-para
  if (order.marketplace_carrier) {
    const map = await resolveCarrierMapping(accountId, { name: order.marketplace_carrier, service: order.marketplace_service, channel: order.channel });
    if (!map.found) {
      await recordIssue({ accountId, source, reason: 'transportadora_nao_mapeada', orderId, externalRef: ref, message: `Transportadora "${order.marketplace_carrier}" sem de-para`, details: { carrier: order.marketplace_carrier, service: order.marketplace_service, channel: order.channel } });
      result.issues.push('transportadora_nao_mapeada');
    } else {
      await resolveIssues({ accountId, orderId, reasons: ['transportadora_nao_mapeada'] });
      chosenCarrierId = map.carrierId || null;
      await query('update app.orders set integration_ignored = $3, ignore_cost = $4, updated_at = now() where account_id = $1 and id = $2', [accountId, orderId, Boolean(map.ignore), Boolean(map.ignoreCost)]);
      if (map.ignore) {
        // Frete gerenciado pelo canal (ex.: Mercado Envios, Fulfillment): não cota nem audita.
        await resolveIssues({ accountId, orderId });
        return { ...result, ignored: true };
      }
    }
  }

  // Pedido já cotado ou despachado: nada a cotar.
  if (!['CREATED', 'READY_FOR_QUOTE'].includes(order.status)) return result;

  // 2) Destino
  const cep = String(p.postal_code || '').replace(/\D/g, '');
  if (cep.length !== 8 || /^0+$/.test(cep)) {
    await recordIssue({ accountId, source, reason: 'cep_invalido', orderId, externalRef: ref, message: `CEP de destino inválido: "${p.postal_code || 'vazio'}"`, details: { postalCode: p.postal_code || null } });
    result.issues.push('cep_invalido');
    return result;
  }
  await resolveIssues({ accountId, orderId, reasons: ['cep_invalido'] });

  // 3) Cotação automática pelas tabelas publicadas
  const body = {
    orderId,
    destinationPostalCode: cep,
    state: p.state,
    city: p.city,
    invoiceAmount: order.invoice_amount || order.total_amount,
    weightKg: Number(p.weight_kg || 1),
    lengthCm: Number(p.length_cm || 10),
    widthCm: Number(p.width_cm || 10),
    heightCm: Number(p.height_cm || 10),
    recipientType: p.recipient_type || 'PF',
    channel: order.channel,
    skus: p.skus || [],
    categories: p.categories || []
  };
  const quote = await createAndCalculateQuote({ accountId, body, requestHash: hashRequest(body) });
  if (!quote.results.length) {
    await recordIssue({ accountId, source, reason: 'sem_cotacao', orderId, externalRef: ref, message: `Nenhuma tabela publicada atende o CEP ${cep}${p.state ? ` (${p.state})` : ''} para ${body.weightKg} kg`, details: { postalCode: cep, state: p.state || null, weightKg: body.weightKg } });
    result.issues.push('sem_cotacao');
    return result;
  }
  await resolveIssues({ accountId, orderId, reasons: ['sem_cotacao'] });

  // Se o canal já definiu a transportadora, seleciona a opção dela; senão, a melhor do ranking.
  const pick = (chosenCarrierId && quote.results.find((r) => r.carrier_id === chosenCarrierId)) || quote.results[0];
  await query('update app.quote_results set selected = true where account_id = $1 and id = $2', [accountId, pick.id]);
  await query("update app.orders set status = 'QUOTED', updated_at = now() where account_id = $1 and id = $2", [accountId, orderId]);
  return { ...result, quoted: true };
}
