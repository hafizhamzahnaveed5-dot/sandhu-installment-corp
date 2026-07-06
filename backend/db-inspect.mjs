import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_8N4ULnjRJyHG@ep-twilight-unit-atfrk77s.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function run() {
  console.log('--- CUSTOMERS ---');
  const res = await pool.query('SELECT id, full_name FROM customers');
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('--- CUSTOMERS COLUMNS ---');
  const colRes = await pool.query(`
    SELECT column_name, data_type, character_maximum_length 
    FROM information_schema.columns 
    WHERE table_name = 'customers'
  `);
  console.log(JSON.stringify(colRes.rows, null, 2));

  console.log('--- USERS ---');
  const userRes = await pool.query('SELECT id, name, customer_id, role FROM users');
  console.log(JSON.stringify(userRes.rows, null, 2));

  await pool.end();
}

run().catch(console.error);
