import XLSX from 'xlsx';
import { query, transaction } from '../db.js';
import { requireAnyRole } from '../utils/context.js';
import { HttpError } from '../utils/router.js';
import { logAudit } from '../services/audit.js';
import { toKg, toCm } from '../services/units.js';

const COLUMNS = ['CNPJ_EMPRESA', 'SKU', 'SKU_MARKETPLACE', 'NOME', 'CATEGORIA', 'PESO', 'UNIDADE_PESO', 'COMPRIMENTO', 'LARGURA', 'ALTURA', 'UNIDADE_MEDIDA'];
const EXAMPLE = ['12345678000190', 'SOFA-3L-001', 'MLB123', 'Sofá 3 lugares cinza', 'Sofás', '45,5', 'kg', '210', '90', '85', 'cm'];
const MAX_ROWS = 20000;

// "Peso (kg)" / "peso" / "PESO" -> "PESO"
const key = (h) => String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const ALIASES = { EMPRESA: 'CNPJ_EMPRESA', CNPJ: 'CNPJ_EMPRESA', SKU_INTERNO: 'SKU', SKU_EXTERNO: 'SKU_MARKETPLACE', PRODUTO: 'NOME', DESCRICAO: 'NOME', PESO_KG: 'PESO', COMPRIMENTO_CM: 'COMPRIMENTO', LARGURA_CM: 'LARGURA', ALTURA_CM: 'ALTURA' };

export function registerProductImportRoutes(app) {
  app.get('/products/import-template', requireAnyRole(['admin', 'operador_logistico'], async ({ ctx }) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([COLUMNS, EXAMPLE]), 'Produtos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Coluna', 'Obrigatória', 'Como preencher'],
      ['CNPJ_EMPRESA', 'Não', 'CNPJ da empresa dona do produto (só números). Em branco = sem empresa.'],
      ['SKU', 'Sim', 'Código interno do produto. Se já existir na mesma empresa, o cadastro é atualizado.'],
      ['SKU_MARKETPLACE', 'Não', 'Código usado no marketplace.'],
      ['NOME', 'Sim', 'Descrição do produto.'],
      ['CATEGORIA', 'Não', 'Usada nas regras de frete.'],
      ['PESO', 'Não*', 'Número (vírgula ou ponto). *Peso e as 3 medidas juntos, ou todos em branco.'],
      ['UNIDADE_PESO', 'Não', 'g, kg, t, lb ou oz. Padrão: kg.'],
      ['COMPRIMENTO / LARGURA / ALTURA', 'Não*', 'Medidas da embalagem.'],
      ['UNIDADE_MEDIDA', 'Não', 'mm, cm, m ou pol. Padrão: cm.']
    ]), 'Instruções');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return { fileName: 'modelo-importacao-produtos.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: Buffer.from(buffer).toString('base64'), correlationId: ctx.correlationId };
  }));

  app.get('/imports', requireAnyRole(['admin', 'operador_logistico', 'visualizador'], async ({ ctx, query: qs }) => {
    const { rows } = await query(
      'select id, kind, file_name, success_count, failure_count, errors, created_at from app.import_jobs where account_id = $1 and ($2::text is null or kind = $2) order by created_at desc limit 50',
      [ctx.accountId, qs.kind || null]
    );
    return { items: rows, correlationId: ctx.correlationId };
  }));

  app.post('/products/import', requireAnyRole(['admin'], async ({ ctx, body }) => {
    if (!body.fileBase64) throw new HttpError(400, 'Envie a planilha (.xlsx ou .csv).');
    let rows;
    try {
      const wb = XLSX.read(Buffer.from(String(body.fileBase64), 'base64'), { type: 'buffer', raw: false, codepage: 65001 });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    } catch {
      throw new HttpError(400, 'Não foi possível ler a planilha. Use o modelo (.xlsx) ou um .csv.');
    }
    if (!rows.length) throw new HttpError(400, 'A planilha está vazia.');
    if (rows.length > MAX_ROWS) throw new HttpError(400, `Limite de ${MAX_ROWS} linhas por arquivo.`);

    const companies = await query('select id, cnpj from app.companies where account_id = $1 and deleted_at is null', [ctx.accountId]);
    const companyByCnpj = new Map(companies.rows.map((c) => [String(c.cnpj).replace(/\D/g, ''), c.id]));

    const errors = [];
    const valid = [];
    rows.forEach((raw, idx) => {
      const line = idx + 2; // linha 1 = cabeçalho
      const r = {};
      for (const [h, v] of Object.entries(raw)) { const k = key(h); r[ALIASES[k] || k] = String(v ?? '').trim(); }
      try {
        if (!r.SKU) throw new Error('SKU em branco');
        if (!r.NOME) throw new Error('NOME em branco');
        let companyId = null;
        const cnpj = (r.CNPJ_EMPRESA || '').replace(/\D/g, '');
        if (cnpj) {
          companyId = companyByCnpj.get(cnpj);
          if (!companyId) throw new Error(`empresa com CNPJ ${cnpj} não cadastrada`);
        }
        const measures = [r.PESO, r.COMPRIMENTO, r.LARGURA, r.ALTURA];
        let logistics = null;
        if (measures.some(Boolean)) {
          if (!measures.every(Boolean)) throw new Error('informe peso e as 3 medidas, ou deixe todos em branco');
          logistics = {
            weightKg: toKg(r.PESO, r.UNIDADE_PESO || 'kg'),
            lengthCm: toCm(r.COMPRIMENTO, r.UNIDADE_MEDIDA || 'cm'),
            widthCm: toCm(r.LARGURA, r.UNIDADE_MEDIDA || 'cm'),
            heightCm: toCm(r.ALTURA, r.UNIDADE_MEDIDA || 'cm')
          };
          if (Object.values(logistics).some((v) => !(v > 0))) throw new Error('peso e medidas devem ser números maiores que zero');
        }
        valid.push({ line, companyId, sku: r.SKU, skuExternal: r.SKU_MARKETPLACE || null, name: r.NOME, category: r.CATEGORIA || null, logistics });
      } catch (error) {
        errors.push({ linha: line, sku: r.SKU || null, erro: error.message });
      }
    });

    let created = 0;
    let updated = 0;
    await transaction(async (client) => {
      for (const p of valid) {
        const existing = await client.query(
          'select id from app.products where account_id = $1 and sku_internal = $2 and company_id is not distinct from $3 and deleted_at is null limit 1',
          [ctx.accountId, p.sku, p.companyId]
        );
        let productId;
        if (existing.rows[0]) {
          productId = existing.rows[0].id;
          await client.query('update app.products set name = $3, sku_external = coalesce($4, sku_external), category = coalesce($5, category) where account_id = $1 and id = $2', [ctx.accountId, productId, p.name, p.skuExternal, p.category]);
          updated += 1;
        } else {
          const ins = await client.query('insert into app.products(account_id, company_id, sku_internal, sku_external, name, category) values($1,$2,$3,$4,$5,$6) returning id', [ctx.accountId, p.companyId, p.sku, p.skuExternal, p.name, p.category]);
          productId = ins.rows[0].id;
          created += 1;
        }
        if (p.logistics) {
          await client.query(
            `insert into app.product_logistics(product_id, account_id, weight_kg, length_cm, width_cm, height_cm, cubing_factor, restrictions)
             values($1,$2,$3,$4,$5,$6,300,'{}'::jsonb)
             on conflict(product_id) do update set weight_kg = excluded.weight_kg, length_cm = excluded.length_cm, width_cm = excluded.width_cm, height_cm = excluded.height_cm, updated_at = now()`,
            [productId, ctx.accountId, p.logistics.weightKg, p.logistics.lengthCm, p.logistics.widthCm, p.logistics.heightCm]
          );
        }
      }
    });

    const job = await query(
      'insert into app.import_jobs(account_id, kind, file_name, success_count, failure_count, errors) values($1,$2,$3,$4,$5,$6) returning id, created_at',
      [ctx.accountId, 'produtos', body.fileName || 'planilha', created + updated, errors.length, JSON.stringify(errors.slice(0, 1000))]
    );
    await logAudit({ accountId: ctx.accountId, userId: ctx.userId, entity: 'product', entityId: job.rows[0].id, action: 'import', afterData: { count: created + updated, created, updated, failures: errors.length }, correlationId: ctx.correlationId });
    return { created, updated, failed: errors.length, errors: errors.slice(0, 200), jobId: job.rows[0].id, correlationId: ctx.correlationId };
  }));
}
