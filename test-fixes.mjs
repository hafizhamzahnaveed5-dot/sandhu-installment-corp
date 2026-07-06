import ProductsService from './assets/js/services/products.service.js';
import AuthService from './assets/js/services/auth.service.js';
import { MOCK_PRODUCTS } from './assets/js/mock/products.mock.js';

// Setup mock mode
import { Config } from './assets/js/config.js';
Config.FEATURE_FLAGS = { MOCK_MODE: true };

async function runTests() {
  console.log("=== Testing Products ===");
  // 1. Edit a product
  const original = MOCK_PRODUCTS[0];
  console.log("Original Product:", original.name, original.price);
  await ProductsService.update(original.id, { price: 999999 });
  console.log("Updated Product:", MOCK_PRODUCTS[0].name, MOCK_PRODUCTS[0].price);
  
  // 2. Update stock
  await ProductsService.updateStock(original.id, 50);
  console.log("Updated Stock:", MOCK_PRODUCTS[0].stockQty);

  // 3. Delete product (linked to active plan, should fail)
  const linkedProdId = 'prod-001'; 
  const res1 = await ProductsService.delete(linkedProdId);
  console.log("Delete linked product:", res1);

  // 4. Delete unlinked product (should succeed)
  const unlinkedProdId = MOCK_PRODUCTS[1].id;
  const res2 = await ProductsService.delete(unlinkedProdId);
  console.log("Delete unlinked product:", res2);

  console.log("\n=== Testing Users ===");
  // 5. Create customer user without customerId (should fail)
  const res3 = await AuthService.createUser({
    name: 'Test Customer', email: 'c@c.com', role: 'customer', password: 'password123'
  });
  console.log("Create customer without customerId:", res3);

  // 6. Create customer user with customerId (should succeed)
  const res4 = await AuthService.createUser({
    name: 'Test Customer', email: 'c@c.com', role: 'customer', password: 'password123', customerId: 'cust-002'
  });
  console.log("Create customer with customerId:", res4.success ? "Success" : res4);

  // 7. Create duplicate customer user (should fail)
  const res5 = await AuthService.createUser({
    name: 'Test Customer 2', email: 'c2@c.com', role: 'customer', password: 'password123', customerId: 'cust-002'
  });
  console.log("Create duplicate customer user:", res5);

  console.log("Tests Complete.");
}

runTests();
