import { query, transaction } from '../db.js';
import { parseFreightXlsx } from '../services/freightTableImporter.js';
import { getAccountId, getUserId } from '../utils/context.js';
import { logAudit } from '../services/audit.js';

export function registerFreightTableRoutes(app) {
  app.post('/freight-tables/import', async ({ req, body }) => {
    const accountId = getAccountId(req);
    const userId = getUserId(req);
    const parsed = parseFreightXlsx(body.fileBase64);
    if (!parsed.ok) return { ok: false, errors: parsed.errors, preview: parsed.preview };

    const result = await transaction(async (client) => {
      const file = await client.query(
        `insert into app.files(account_id, storage_bucket, storage_path, file_name, mime_type, byte_size, metadata)
         values($1,'freight-tables',$2,$3,$4,$5,$6) returning *`,
        [accountId, `uploads/${Date.now()}-${body.fileName}`, body.fileName || 'table.xlsx', body.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body.byteSize || 0, { source: 'api' }]
      );
      const table = await client.query(
        `insert into app.freight_tables(account_id, name, carrier_id)
         values($1,$2,$3) returning *`,
        [accountId, body.tableName, body.carrierId || null]
      );
      const version = await client.query(
        `insert into app.freight_table_versions(table_id, account_id, version_label, status, raw_file_path, created_by)
         values($1,$2,$3,'DRAFT',$4,$5) returning *`,
        [table.rows[0].id, accountId, body.versionLabel || `v-${Date.now()}`, file.rows[0].storage_path, userId]
      );
      for (const r of parsed.normalized.routes) {
        await client.query(
          `insert into app.freight_routes(version_id, account_id, cep_start, cep_end, state, city, min_weight, max_weight, base_amount, extra_per_kg, min_freight, ad_valorem_pct, gris_pct, trt_amount, tda_amount, cubing_factor, sla_days)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [version.rows[0].id, accountId, r.cep_start, r.cep_end, r.state, r.city, r.min_weight, r.max_weight, r.base_amount, r.extra_per_kg, r.min_freight, r.ad_valorem_pct, r.gris_pct, r.trt_amount, r.tda_amount, r.cubing_factor, r.sla_days]
        );
      }
      for (const f of parsed.normalized.recipientFees) {
        await client.query(
          `insert into app.freight_recipient_fees(account_id, version_id, recipient_document, fee_type, amount)
           values($1,$2,$3,$4,$5)`,
          [accountId, version.rows[0].id, f.recipient_document, f.fee_type, f.amount]
        );
      }
      return { table: table.rows[0], version: version.rows[0], file: file.rows[0] };
    });

    await logAudit({ accountId, userId, entity: 'freight_table_version', entityId: result.version.id, action: 'import_draft', afterData: parsed.preview.counts });
    return { ok: true, preview: parsed.preview, ...result };
  });

  app.post('/freight-tables/versions/:id/publish', async ({ req, params }) => {
    const accountId = getAccountId(req);
    await query('select app.publish_freight_table_version($1)', [params.id]);
    return { published: true, versionId: params.id, accountId };
  });

  app.post('/freight-tables/versions/:id/rollback', async ({ params }) => {
    await query('select app.rollback_freight_table_version($1)', [params.id]);
    return { rolledBack: true, versionId: params.id };
  });
}
