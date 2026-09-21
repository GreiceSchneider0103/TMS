import pg from 'pg';

export async function finalizeFreightImport(versionId) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const version = await client.query('select * from app.freight_table_versions where id = $1', [versionId]);
    if (!version.rows[0]) throw new Error('Version not found');
    await client.query('select app.publish_freight_table_version($1)', [versionId]);
    await client.query(
      `insert into app.audit_logs(account_id, entity, entity_id, action, after_data)
       values($1,'freight_table_version',$2,'publish', $3)`,
      [version.rows[0].account_id, versionId, { published: true }]
    );
    return { published: true };
  } finally {
    client.release();
    await pool.end();
  }
}
