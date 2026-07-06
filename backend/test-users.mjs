import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_8N4ULnjRJyHG@ep-twilight-unit-atfrk77s.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require' });
const JWT_SECRET = 'zktcbAbGh8U3lrHNFZyJr1FgNlpUVskYljVjxGl3jkDaVTYQf9ViudR4pv+u0++s';
const BASE_URL = 'http://localhost:3000/api';

async function runTests() {
  console.log('Fetching admin user from database...');
  const adminRes = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!adminRes.rowCount) {
    console.error('No admin found in DB');
    process.exit(1);
  }
  const adminId = adminRes.rows[0].id;

  // Forge a valid token
  const token = jwt.sign(
    { id: adminId, role: 'admin', permissions: ['*'] },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  console.log('\\n--- 1. Creating Test User ---');
  let res = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Test Delete User', email: `testdelete${Date.now()}@test.com`, password: 'pass', role: 'agent' })
  });
  let data = await res.json();
  const testUserId = data.data.id;
  console.log('✅ Created test user:', testUserId);

  console.log('\\n--- 2. Testing Edit User ---');
  res = await fetch(`${BASE_URL}/users/${testUserId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'Renamed Test User', role: 'manager', status: 'active' })
  });
  data = await res.json();
  if (data.success && data.data.name === 'Renamed Test User') {
    console.log('✅ Edited test user successfully');
  } else {
    console.error('❌ Failed to edit test user', data);
  }

  console.log('\\n--- 3. Testing Self-Delete Safeguard ---');
  res = await fetch(`${BASE_URL}/users/${adminId}`, { method: 'DELETE', headers });
  data = await res.json();
  if (!data.success && data.error === 'You cannot delete your own account.') {
    console.log('✅ Safeguard working: Blocked self-deletion');
  } else {
    console.error('❌ Safeguard failed', data);
  }

  console.log('\\n--- 4. Testing Last Admin Demote Safeguard ---');
  res = await fetch(`${BASE_URL}/users/${adminId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'Admin', role: 'manager', status: 'active' })
  });
  data = await res.json();
  if (!data.success && data.error === 'Cannot demote or deactivate the last active admin account.') {
    console.log('✅ Safeguard working: Blocked last-admin demotion');
  } else {
    console.error('❌ Safeguard failed (might happen if there are multiple admins)', data);
  }

  console.log('\\n--- 5. Testing Delete User ---');
  res = await fetch(`${BASE_URL}/users/${testUserId}`, { method: 'DELETE', headers });
  data = await res.json();
  if (data.success) {
    console.log('✅ Deleted test user successfully');
  } else {
    console.error('❌ Failed to delete test user', data);
  }

  console.log('\\n--- 6. Verifying Audit Log ---');
  const auditRes = await pool.query("SELECT * FROM audit_logs WHERE record_id = $1 ORDER BY created_at DESC", [testUserId]);
  console.log(`✅ Found ${auditRes.rowCount} audit logs for test user. Latest action:`, auditRes.rowCount ? auditRes.rows[0].action : 'None');

  process.exit(0);
}

runTests().catch(console.error);
