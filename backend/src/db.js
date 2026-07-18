import pg from 'pg';
import { config, requireConfig } from './config.js';

requireConfig();

const isServerless = Boolean(process.env.VERCEL);

/** Neon + node-pg: channel_binding=require often breaks serverless connections. */
function normalizeDatabaseUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('channel_binding');
    if (!parsed.searchParams.get('sslmode')) {
      parsed.searchParams.set('sslmode', 'require');
    }
    return parsed.toString();
  } catch {
    return String(url).replace(/([?&])channel_binding=[^&]*/g, '$1').replace(/[?&]$/, '');
  }
}

export const pool = new pg.Pool({
  connectionString: normalizeDatabaseUrl(config.databaseUrl),
  // Serverless: keep the pool tiny so Neon connections are not exhausted
  max: isServerless ? 1 : 10,
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,
  connectionTimeoutMillis: 15_000,
  ssl: undefined, // Neon URLs already include sslmode=require
});

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
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
