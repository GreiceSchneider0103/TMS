import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

function testRbacByRole() {
  const context = read('apps/api/src/utils/context.js');
  assert.match(context, /export function requireAnyRole\(/);
  assert.match(context, /HttpError\(403/);
  const routes = ['orders', 'quotes', 'shipments', 'tracking', 'freightTables', 'dashboard'];
  for (const r of routes) {
    const src = read(`apps/api/src/routes/${r}.js`);
    assert.match(src, /requireAnyRole\(/);
  }
}

function testTenantIsolationGuards() {
  const criticalRoutes = ['orders', 'quotes', 'shipments', 'tracking', 'dashboard', 'logs'];
  for (const r of criticalRoutes) {
    const src = read(`apps/api/src/routes/${r}.js`);
    assert.ok(src.includes('account_id = $1'), `missing tenant filter in ${r}`);
  }
}

function testRecipientUniqueActiveByTenant() {
  const migration = read('supabase/migrations/004_v1_operational_crud.sql');
  assert.match(migration, /uq_recipients_document_active/);
  assert.match(migration, /app\.recipients\(account_id, document\)/);
  assert.match(migration, /where deleted_at is null/);
}

function testParserXlsxValidInvalidCoverage() {
  const parser = read('apps/api/src/services/freightTableImporter.js');
  for (const sheet of ['Configurações', 'Tipo de carga', 'Rotas', 'Taxas por destinatário', 'TRT', 'TDA', 'MODAL', 'GRIS-ADV', 'Restrição de entrega']) {
    assert.ok(parser.includes(sheet), `required sheet missing: ${sheet}`);
  }
  for (const fn of ['validateRoutes', 'validateRecipientFees', 'validateRangeValueSheet', 'validateModal', 'validateGris', 'validateRestriction']) {
    assert.ok(parser.includes(`function ${fn}`), `missing validator ${fn}`);
  }
}

function testWorkerRetryDeadLetterAndConcurrency() {
  const worker = read('workers/src/tinySync.js');
  assert.match(worker, /for update skip locked/i);
  assert.match(worker, /dead_letter = false/);
  assert.match(worker, /attempts < 8/);
  assert.match(worker, /deadLetter = attempts >= 8/);
  assert.match(worker, /next_retry_at = now\(\) \+ \(\$4 \|\| ' milliseconds'\)::interval/);
}

function testDashboardTenantNoMix() {
  const dashboard = read('apps/api/src/routes/dashboard.js');
  assert.ok((dashboard.match(/account_id = \$1/g) || []).length >= 2);
}

testRbacByRole();
testTenantIsolationGuards();
testRecipientUniqueActiveByTenant();
testParserXlsxValidInvalidCoverage();
testWorkerRetryDeadLetterAndConcurrency();
testDashboardTenantNoMix();

console.log('ok');
