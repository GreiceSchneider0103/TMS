import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:0103AlexGreice@db.fbkgewitqskhtuyvodqp.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  const schemas = await client.query("select schema_name from information_schema.schemata order by 1");
  console.log('SCHEMAS:', schemas.rows.map(r => r.schema_name).join(', '));

  const tables = await client.query(
    "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by 1,2"
  );
  console.log('TABLES:');
  for (const r of tables.rows) console.log(' -', r.table_schema + '.' + r.table_name);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await client.end();
}
