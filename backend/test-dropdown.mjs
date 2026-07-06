import jwt from 'jsonwebtoken';
const JWT_SECRET = 'zktcbAbGh8U3lrHNFZyJr1FgNlpUVskYljVjxGl3jkDaVTYQf9ViudR4pv+u0++s';
const BASE_URL = 'http://localhost:3000/api';

async function run() {
  // Forge admin token
  const token = jwt.sign(
    { id: 'admin-1', role: 'admin', permissions: ['*'] },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  console.log('1. Fetching customers like frontend does...');
  let res = await fetch(`${BASE_URL}/customers?pageSize=1000`, { headers });
  let data = await res.json();
  const customers = data.data;
  console.log(`Fetched ${customers.length} customers. First customer ID:`, customers[0]?.id);

  if (customers.length === 0) {
    console.error('No customers found.');
    process.exit(1);
  }

  const customerId = customers[1].id;
  console.log(`2. Attempting to create Customer user with customerId: "${customerId}"`);

  res = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Customer Test',
      email: `custest${Date.now()}@test.com`,
      password: 'password123',
      role: 'customer',
      customerId: customerId
    })
  });

  data = await res.json();
  console.log('Response:', data);
  process.exit(0);
}

run().catch(console.error);
