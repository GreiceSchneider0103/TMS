import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const dbContextStorage = new AsyncLocalStorage();

export function runWithDbContext(ctx, fn) {
  return dbContextStorage.run(ctx, fn);
}

export function setDbContext(ctx) {
  dbContextStorage.enterWith(ctx);
}

export function getDbContext() {
  return dbContextStorage.getStore() || null;
}

export async function query(text, params = []) {
  const client = await pool.connect();
  const ctx = getDbContext();
  try {
    if (ctx?.accountId) {
      await setSessionContext(client, ctx, false);
    }
    return await client.query(text, params);
  } finally {
    if (ctx?.accountId) {
      await resetSessionContext(client);
    }
    client.release();
  }
}

export async function transaction(handler) {
  const client = await pool.connect();
  const ctx = getDbContext();
  try {
    await client.query('begin');
    if (ctx?.accountId) {
      await setSessionContext(client, ctx, true);
    }
    const result = await handler(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function setSessionContext(client, ctx, isLocal) {
  await client.query(
    `select
      set_config('app.current_account_id', $1, $4),
      set_config('app.current_role', $2, $4),
      set_config('app.correlation_id', $3, $4)`,
    [String(ctx.accountId), String(ctx.role || ''), String(ctx.correlationId || ''), isLocal]
  );
}

async function resetSessionContext(client) {
  await client.query(
    `select
      set_config('app.current_account_id', '', false),
      set_config('app.current_role', '', false),
      set_config('app.correlation_id', '', false)`
  );
}
