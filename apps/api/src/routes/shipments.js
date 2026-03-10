import { query, transaction } from '../db.js';
import { getAccountId, getUserId } from '../utils/context.js';
import { logAudit } from '../services/audit.js';

export function registerShipmentRoutes(app) {
  app.get('/shipments', async ({ req }) => {
    const accountId = getAccountId(req);
    const { rows } = await query('select * from app.shipments where account_id = $1 order by created_at desc limit 100', [accountId]);
    return { items: rows };
  });

  app.get('/shipments/:id', async ({ req, params }) => {
    const accountId = getAccountId(req);
    const shipment = await query('select * from app.shipments where account_id = $1 and id = $2', [accountId, params.id]);
    if (!shipment.rows[0]) throw new Error('Shipment not found');
    const packages = await query('select * from app.shipment_packages where account_id = $1 and shipment_id = $2 order by package_number', [accountId, params.id]);
    const tracking = await query('select * from app.tracking_events where account_id = $1 and shipment_id = $2 order by occurred_at desc', [accountId, params.id]);
    return { ...shipment.rows[0], packages: packages.rows, tracking: tracking.rows };
  });

  app.post('/shipments', async ({ req, body }) => {
    const accountId = getAccountId(req);
    const userId = getUserId(req);

    const result = await transaction(async (client) => {
      const quoteRes = await client.query('select * from app.quote_results where account_id = $1 and id = $2', [accountId, body.quoteResultId]);
      if (!quoteRes.rows[0]) throw new Error('Quote result not found');
      const q = quoteRes.rows[0];
      const ins = await client.query(
        `insert into app.shipments(account_id, order_id, quote_result_id, carrier_id, carrier_service_id, tracking_code, invoice_number, cte_number, status)
         values($1,$2,$3,$4,$5,$6,$7,$8,'DISPATCHED') returning *`,
        [accountId, body.orderId, body.quoteResultId, q.carrier_id, body.carrierServiceId || null, body.trackingCode || null, body.invoiceNumber || null, body.cteNumber || null]
      );
      const shipment = ins.rows[0];
      const packages = body.packages || [{ package_number: 1, weight_kg: body.weightKg || 1 }];
      for (const p of packages) {
        await client.query(
          `insert into app.shipment_packages(account_id, shipment_id, package_number, weight_kg, length_cm, width_cm, height_cm, tracking_code, metadata)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict(shipment_id, package_number)
           do update set weight_kg = excluded.weight_kg, length_cm = excluded.length_cm, width_cm = excluded.width_cm, height_cm = excluded.height_cm, tracking_code = excluded.tracking_code, metadata = excluded.metadata`,
          [accountId, shipment.id, p.package_number, p.weight_kg, p.length_cm || null, p.width_cm || null, p.height_cm || null, p.tracking_code || null, p.metadata || {}]
        );
      }
      return shipment;
    });

    await logAudit({ accountId, userId, entity: 'shipment', entityId: result.id, action: 'create_shipment', afterData: body });
    return result;
  });
}
