import jwt from 'jsonwebtoken';

const JWT_SECRET = 'zktcbAbGh8U3lrHNFZyJr1FgNlpUVskYljVjxGl3jkDaVTYQf9ViudR4pv+u0++s';
const BASE_URL = 'http://localhost:3000/api';

async function run() {
  const token = jwt.sign(
    { id: 'admin-1', role: 'admin', permissions: ['*'] },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Create Admin
  console.log('Creating Admin user...');
  let res = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Admin Test User', email: `admin-${Date.now()}@test.com`, password: 'password123', role: 'admin' })
  });
  let data = await res.json();
  console.log('Admin Response:', data.success ? '✅ Success' : `❌ Error: ${data.error}`);

  // 2. Create Manager
  console.log('Creating Manager user...');
  res = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Manager Test User', email: `manager-${Date.now()}@test.com`, password: 'password123', role: 'manager' })
  });
  data = await res.json();
  console.log('Manager Response:', data.success ? '✅ Success' : `❌ Error: ${data.error}`);

  // 3. Create Agent
  console.log('Creating Agent user...');
  res = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Agent Test User', email: `agent-${Date.now()}@test.com`, password: 'password123', role: 'agent' })
  });
  data = await res.json();
  console.log('Agent Response:', data.success ? '✅ Success' : `❌ Error: ${data.error}`);

  // 4. Create Customer (with cust-003 which is currently unlinked)
  console.log('Creating Customer user (unlinked cust-003)...');
  res = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Customer Test User', email: `customer-${Date.now()}@test.com`, password: 'password123', role: 'customer', customerId: 'cust-003' })
  });
  data = await res.json();
  console.log('Customer Response:', data.success ? '✅ Success' : `❌ Error: ${data.error}`);

  process.exit(0);
}

run().catch(console.error);
