import pg from 'pg';

/**
 * Loads an active carrier's id and decrypted credentials from the database.
 *
 * Credentials live in Supabase Vault (supabase_vault extension), stored as
 * a single JSON secret per carrier and referenced by
 * app.carriers.credential_vault_id. This keeps carrier API credentials out
 * of Render environment variables: rotating a password or activating a new
 * carrier account becomes a database update, not a redeploy.
 *
 * Requires a DB role that can read vault.decrypted_secrets (the "postgres"
 * role has this by default; a restricted app role would need it granted).
 */
export async function loadCarrierCredentials(integrationType, { pool = null } = {}) {
  const ownPool = !pool;
  const usePool = pool || new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await usePool.connect();
  try {
    const carrierResult = await client.query(
      `select id, credential_vault_id from app.carriers
       where integration_type = $1 and is_active = true and deleted_at is null
       order by priority asc nulls last
       limit 1`,
      [integrationType]
    );
    const carrier = carrierResult.rows[0];
    if (!carrier) {
      const err = new Error(`No active carrier found for integration_type=${integrationType}`);
      err.code = 'CARRIER_NOT_FOUND';
      throw err;
    }
    if (!carrier.credential_vault_id) {
      const err = new Error(
        `Carrier ${carrier.id} (integration_type=${integrationType}) has no credential_vault_id configured`
      );
      err.code = 'CARRIER_CREDENTIALS_NOT_CONFIGURED';
      throw err;
    }

    const secretResult = await client.query(
      `select decrypted_secret from vault.decrypted_secrets where id = $1`,
      [carrier.credential_vault_id]
    );
    const secretRow = secretResult.rows[0];
    if (!secretRow) {
      const err = new Error(`Vault secret ${carrier.credential_vault_id} not found`);
      err.code = 'CARRIER_SECRET_NOT_FOUND';
      throw err;
    }

    let credentials;
    try {
      credentials = JSON.parse(secretRow.decrypted_secret);
    } catch (parseErr) {
      const err = new Error(`Vault secret ${carrier.credential_vault_id} is not valid JSON`);
      err.code = 'CARRIER_SECRET_INVALID';
      throw err;
    }

    return { carrierId: carrier.id, credentials };
  } finally {
    client.release();
    if (ownPool) {
      await usePool.end();
    }
  }
}
