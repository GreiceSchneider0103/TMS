import XLSX from 'xlsx';
import { query, transaction } from '../db.js';
import { parseFreightXlsx } from '../services/freightTableImporter.js';
import { requireAnyRole } from '../utils/context.js';
import { logAudit } from '../services/audit.js';
import { buildFreightExport, freightExportWorkbook } from '../services/freightExport.js';

const BULK_INSERT_CHUNK_SIZE = 500;

async function bulkInsert(client, table, columns, rows) {
  for (let offset = 0; offset < rows.length; offset += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + BULK_INSERT_CHUNK_SIZE);
    const values = [];
    const tuples = chunk.map((row, i) => {
      const placeholders = row.map((_, j) => `$${i * columns.length + j + 1}`);
      values.push(...row);
      return `(${placeholders.join(',')})`;
    });
    await client.query(
      `insert into ${table}(${columns.join(',')}) values ${tuples.join(',')}`,
      values
    );
  }
}

export function registerFreightTableRoutes(app) {
  app.get('/freight-tables', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx }) => {
    const { rows } = await query(
      `select t.id as table_id, t.name, c.name as carrier_name, v.id as version_id, v.version_label, v.status, v.published_at, v.created_at
       from app.freight_tables t
       left join app.carriers c on c.id = t.carrier_id
       left join lateral (
         select * from app.freight_table_versions where table_id = t.id order by created_at desc limit 1
       ) v on true
       where t.account_id = $1
       order by t.created_at desc`,
      [ctx.accountId]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.post('/freight-tables/import', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, body }) => {
    const parsed = parseFreightXlsx(body.fileBase64);
    if (!parsed.ok) return { ok: false, errors: parsed.errors, preview: parsed.preview, correlationId: ctx.correlationId };

    const result = await transaction(async (client) => {
      const file = await client.query(
        `insert into app.files(account_id, storage_bucket, storage_path, file_name, mime_type, byte_size, metadata, content)
         values($1,'freight-tables',$2,$3,$4,$5,$6,$7) returning id, storage_path, file_name`,
        [ctx.accountId, `uploads/${Date.now()}-${body.fileName}`, body.fileName || 'table.xlsx', body.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body.byteSize || 0, { source: 'api', preview_counts: parsed.preview.counts }, Buffer.from(String(body.fileBase64 || ''), 'base64')]
      );
      const table = await client.query(`insert into app.freight_tables(account_id, name, carrier_id) values($1,$2,$3) returning *`, [ctx.accountId, body.tableName, body.carrierId || null]);
      const version = await client.query(
        `insert into app.freight_table_versions(table_id, account_id, version_label, status, raw_file_path, created_by)
         values($1,$2,$3,'DRAFT',$4,$5) returning *`,
        [table.rows[0].id, ctx.accountId, body.versionLabel || `v-${Date.now()}`, file.rows[0].storage_path, ctx.userId]
      );
      await bulkInsert(client, 'app.freight_routes',
        ['version_id', 'account_id', 'cep_start', 'cep_end', 'state', 'city', 'min_weight', 'max_weight', 'base_amount', 'extra_per_kg', 'min_freight', 'ad_valorem_pct', 'gris_pct', 'trt_amount', 'tda_amount', 'cubing_factor', 'sla_days'],
        parsed.normalized.routes.map((r) => [version.rows[0].id, ctx.accountId, r.cep_start, r.cep_end, r.state, r.city, r.min_weight, r.max_weight, r.base_amount, r.extra_per_kg, r.min_freight, r.ad_valorem_pct, r.gris_pct, r.trt_amount, r.tda_amount, r.cubing_factor, r.sla_days])
      );
      await bulkInsert(client, 'app.freight_recipient_fees',
        ['account_id', 'version_id', 'recipient_document', 'fee_type', 'amount'],
        parsed.normalized.recipientFees.map((f) => [ctx.accountId, version.rows[0].id, f.recipient_document, f.fee_type, f.amount])
      );
      return { table: table.rows[0], version: version.rows[0], file: file.rows[0] };
    });

    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'freight_table_version', entityId: result.version.id, action: 'import_draft', afterData: parsed.preview.counts, correlationId: ctx.correlationId });
    return { ok: true, preview: parsed.preview, ...result, correlationId: ctx.correlationId };
  }));

  // Exporta as tabelas publicadas (com as regras do canal) como planilha CEP x peso para subir em outras plataformas.
  app.post('/freight-tables/export', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, body }) => {
    const bands = typeof body.weightBands === 'string'
      ? body.weightBands.split(/[;\s|]+/).map((x) => Number(String(x).replace(',', '.'))).filter((n) => n > 0)
      : Array.isArray(body.weightBands) ? body.weightBands : null;
    if (bands && bands.length > 80) throw new Error('Use no máximo 80 faixas de peso.');
    const invoiceValue = Number(String(body.invoiceValue ?? 0).replace(',', '.')) || 0;
    const result = await buildFreightExport(ctx.accountId, { channel: body.channel || null, carrierId: body.carrierId || null, invoiceValue, weightBands: bands });
    if (!result.rows.length) throw new Error('Nenhuma rota publicada para exportar. Publique uma tabela de frete antes.');
    const buffer = freightExportWorkbook(result, { channelLabel: body.channelLabel || body.channel || 'todos os canais', invoiceValue });
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'freight_table', entityId: ctx.accountId, action: 'export', afterData: { count: result.rows.length }, correlationId: ctx.correlationId });
    return {
      fileName: `tabela-frete-${(body.channel || 'geral')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentBase64: buffer.toString('base64'),
      summary: { ...result.summary, bands: result.bands },
      correlationId: ctx.correlationId
    };
  }));

  // Download da planilha: devolve o arquivo original quando foi guardado; senão gera uma planilha a partir das rotas gravadas.
  app.get('/freight-tables/versions/:id/download', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, params }) => {
    const version = await query(
      `select v.*, t.name as table_name from app.freight_table_versions v join app.freight_tables t on t.id = v.table_id
       where v.account_id = $1 and v.id = $2`,
      [ctx.accountId, params.id]
    );
    if (!version.rows[0]) throw new Error('Version not found');
    const v = version.rows[0];
    const safeName = String(v.table_name || 'tabela-frete').replace(/[^\p{L}\p{N} ._-]+/gu, '').trim() || 'tabela-frete';

    if (v.raw_file_path) {
      const file = await query(
        `select file_name, mime_type, encode(content, 'base64') as content_base64 from app.files
         where account_id = $1 and storage_path = $2 and content is not null order by created_at desc limit 1`,
        [ctx.accountId, v.raw_file_path]
      );
      if (file.rows[0]) {
        return { fileName: file.rows[0].file_name, mimeType: file.rows[0].mime_type, original: true, contentBase64: file.rows[0].content_base64, correlationId: ctx.correlationId };
      }
    }

    const routes = await query(
      `select cep_start, cep_end, state, city, min_weight, max_weight, base_amount, extra_per_kg, min_freight, ad_valorem_pct, gris_pct, trt_amount, tda_amount, cubing_factor, sla_days
       from app.freight_routes where account_id = $1 and version_id = $2 order by cep_start, min_weight`,
      [ctx.accountId, params.id]
    );
    const fees = await query(
      'select recipient_document, fee_type, amount from app.freight_recipient_fees where account_id = $1 and version_id = $2 order by recipient_document',
      [ctx.accountId, params.id]
    );
    const num = (x) => (x === null || x === undefined ? null : Number(x));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(routes.rows.map((r) => ({
      'CEP Inicial': r.cep_start, 'CEP Final': r.cep_end, UF: r.state || '', Cidade: r.city || '',
      'Peso mínimo (kg)': num(r.min_weight), 'Peso máximo (kg)': num(r.max_weight), 'Valor base (R$)': num(r.base_amount),
      'Excedente por kg (R$)': num(r.extra_per_kg), 'Frete mínimo (R$)': num(r.min_freight), 'Ad valorem (%)': num(r.ad_valorem_pct),
      'GRIS (%)': num(r.gris_pct), 'TRT (R$)': num(r.trt_amount), 'TDA (R$)': num(r.tda_amount), 'Fator de cubagem': num(r.cubing_factor), 'Prazo (dias)': num(r.sla_days)
    }))), 'Rotas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fees.rows.map((f) => ({ 'CNPJ / CPF': f.recipient_document, Tipo: String(f.fee_type || '').toUpperCase(), 'Valor (R$)': num(f.amount) }))), 'Taxas por destinatário');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return {
      fileName: `${safeName} - ${v.version_label || 'versao'}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      original: false,
      contentBase64: Buffer.from(buffer).toString('base64'),
      correlationId: ctx.correlationId
    };
  }));

  app.post('/freight-tables/versions/:id/publish', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx, params }) => {
    const version = await query('select * from app.freight_table_versions where account_id = $1 and id = $2', [ctx.accountId, params.id]);
    if (!version.rows[0]) throw new Error('Version not found');

    await query('select app.publish_freight_table_version($1)', [params.id]);
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'freight_table_version', entityId: params.id, action: 'publish', correlationId: ctx.correlationId });
    return { published: true, versionId: params.id, correlationId: ctx.correlationId };
  }));

  app.post('/freight-tables/versions/:id/rollback', requireAnyRole(['admin'], async ({ ctx, params }) => {
    const version = await query('select * from app.freight_table_versions where account_id = $1 and id = $2', [ctx.accountId, params.id]);
    if (!version.rows[0]) throw new Error('Version not found');

    await query('select app.rollback_freight_table_version($1)', [params.id]);
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'freight_table_version', entityId: params.id, action: 'rollback', correlationId: ctx.correlationId });
    return { rolledBack: true, versionId: params.id, correlationId: ctx.correlationId };
  }));
}