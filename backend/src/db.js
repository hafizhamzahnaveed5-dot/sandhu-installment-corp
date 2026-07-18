import pg from 'pg';
import { config, requireConfig } from './config.js';

requireConfig();

const isServerless = Boolean(process.env.VERCEL);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Serverless: keep the pool tiny so Neon connections are not exhausted
  max: isServerless ? 1 : 10,
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,
  connectionTimeoutMillis: 15_000,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
