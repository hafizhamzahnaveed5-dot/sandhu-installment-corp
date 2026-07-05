import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/db.js';
import { permissionsFor } from '../src/utils/permissions.js';

const categories = [
  { id: 'cat-001', name: 'Electronics', parentCategoryId: null },
  { id: 'cat-002', name: 'Home Appliances', parentCategoryId: null },
  { id: 'cat-003', name: 'Furniture', parentCategoryId: null },
  { id: 'cat-004', name: 'Mobile Phones', parentCategoryId: 'cat-001' },
  { id: 'cat-005', name: 'Laptops', parentCategoryId: 'cat-001' },
];

const products = [
  { id: 'prod-001', name: 'Samsung Galaxy A54 5G', categoryId: 'cat-004', price: 75000, sku: 'SAM-A54-BLK', status: 'active', imageUrl: null, stockQty: 12, description: '128GB, 6GB RAM, Black' },
  { id: 'prod-002', name: 'Dell Inspiron 15 Laptop', categoryId: 'cat-005', price: 120000, sku: 'DELL-INS15-SLV', status: 'active', imageUrl: null, stockQty: 5, description: 'Intel Core i5, 8GB RAM, 512GB SSD' },
  { id: 'prod-003', name: 'Haier Split AC 1.5 Ton', categoryId: 'cat-002', price: 85000, sku: 'HAIER-AC-15T', status: 'active', imageUrl: null, stockQty: 8, description: 'Inverter technology, 1.5 ton' },
  { id: 'prod-004', name: 'LED TV 43 inch', categoryId: 'cat-001', price: 55000, sku: 'LED-TV-43', status: 'active', imageUrl: null, stockQty: 6, description: '4K Ultra HD Smart TV' },
];

const customers = [
  { id: 'cust-001', fullName: 'Muhammad Arif Khan', cnicOrId: '35202-1234567-1', phone: '+923001234567', email: 'arif.khan@email.com', address: 'House 12, Street 4, Gulberg III', city: 'Lahore', status: 'active', guarantorName: 'Tariq Mahmood', guarantorPhone: '+923009876543', creditScore: 720, notes: 'Reliable customer, always pays on time.' },
  { id: 'cust-002', fullName: 'Fatima Bibi', cnicOrId: '35202-9876543-2', phone: '+923331122334', email: 'fatima.bibi@email.com', address: 'Flat 5B, Model Town', city: 'Lahore', status: 'active', guarantorName: 'Abdul Rehman', guarantorPhone: '+923004455667', creditScore: 680, notes: '' },
  { id: 'cust-003', fullName: 'Hassan Ali Mirza', cnicOrId: '35202-5551234-3', phone: '+923451234567', email: 'hassan.mirza@email.com', address: '23 Johar Town Block C', city: 'Lahore', status: 'active', guarantorName: 'Iqbal Hussain', guarantorPhone: '+923007654321', creditScore: 750, notes: 'Requested 2 installment plans simultaneously.' },
  { id: 'cust-004', fullName: 'Amna Malik', cnicOrId: '35202-7777888-4', phone: '+923211122334', email: 'amna.malik@email.com', address: 'DHA Phase 5, Block J', city: 'Lahore', status: 'inactive', guarantorName: '', guarantorPhone: '', creditScore: 610, notes: 'Completed all plans. No active plans.' },
];

const users = [
  { id: 'user-001', name: 'Sandhu Admin', email: 'admin@sandhuinstallments.com', role: 'admin', password: 'admin123', customerId: null },
  { id: 'user-002', name: 'Hamza Ahmed', email: 'hamza@sandhuinstallments.com', role: 'manager', password: 'manager123', customerId: null },
  { id: 'user-003', name: 'Sara Ali', email: 'sara@sandhuinstallments.com', role: 'agent', password: 'agent123', customerId: null },
  { id: 'user-004', name: 'Muhammad Arif Khan', email: 'arif.customer@email.com', role: 'customer', password: 'customer123', customerId: 'cust-001' },
];

const plans = [
  { id: 'plan-001', customerId: 'cust-001', productId: 'prod-001', principalAmount: 85000, downPayment: 10000, numberOfInstallments: 12, installmentAmount: 7084, frequency: 'monthly', startDate: '2026-01-01', status: 'active', interestOrMarkup: 10, createdBy: 'user-001' },
  { id: 'plan-002', customerId: 'cust-002', productId: 'prod-003', principalAmount: 45000, downPayment: 5000, numberOfInstallments: 8, installmentAmount: 5625, frequency: 'monthly', startDate: '2026-02-01', status: 'active', interestOrMarkup: 0, createdBy: 'user-002' },
  { id: 'plan-003', customerId: 'cust-004', productId: 'prod-004', principalAmount: 30000, downPayment: 5000, numberOfInstallments: 6, installmentAmount: 5000, frequency: 'monthly', startDate: '2025-10-01', status: 'completed', interestOrMarkup: 0, createdBy: 'user-001' },
];

const payments = [
  { id: 'pay-001', planId: 'plan-001', scheduleId: 'sch-plan-001-1', customerId: 'cust-001', amount: 7084, method: 'cash', receivedBy: 'user-002', receiptNumber: 'RCP-2026-0001', paidAt: '2026-01-03T11:00:00Z', notes: '' },
  { id: 'pay-002', planId: 'plan-001', scheduleId: 'sch-plan-001-2', customerId: 'cust-001', amount: 7084, method: 'bank', receivedBy: 'user-002', receiptNumber: 'RCP-2026-0002', paidAt: '2026-02-04T10:30:00Z', notes: 'Bank transfer ref: BT2026020401' },
  { id: 'pay-003', planId: 'plan-002', scheduleId: 'sch-plan-002-1', customerId: 'cust-002', amount: 5625, method: 'online', receivedBy: 'user-001', receiptNumber: 'RCP-2026-0003', paidAt: '2026-02-02T14:00:00Z', notes: 'JazzCash payment' },
];

function addPeriod(startDate, frequency, index) {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + index * 7);
  else date.setUTCMonth(date.getUTCMonth() + index);
  return date.toISOString().slice(0, 10);
}

function scheduleFor(plan) {
  return Array.from({ length: plan.numberOfInstallments }, (_, index) => {
    const number = index + 1;
    const scheduleId = `sch-${plan.id}-${number}`;
    const explicitPaid = payments.filter((payment) => payment.scheduleId === scheduleId).reduce((sum, payment) => sum + payment.amount, 0);
    const paid = plan.status === 'completed' ? plan.installmentAmount : explicitPaid;
    return {
      id: scheduleId,
      planId: plan.id,
      installmentNumber: number,
      dueDate: addPeriod(plan.startDate, plan.frequency, index),
      amountDue: plan.installmentAmount,
      amountPaid: paid,
      status: paid >= plan.installmentAmount ? 'paid' : number <= 3 && plan.status !== 'completed' ? 'overdue' : plan.status === 'completed' ? 'paid' : 'pending',
      paidDate: paid > 0 ? payments.find((payment) => payment.scheduleId === scheduleId)?.paidAt : null,
    };
  });
}

async function main() {
  await withTransaction(async (client) => {
    for (const customer of customers) {
      await client.query(
        `INSERT INTO customers
         (id, full_name, cnic_or_id, phone, email, address, city, status, guarantor_name, guarantor_phone, documents, credit_score, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]'::jsonb,$11,$12)
         ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name, phone=EXCLUDED.phone`,
        [customer.id, customer.fullName, customer.cnicOrId, customer.phone, customer.email, customer.address, customer.city, customer.status, customer.guarantorName, customer.guarantorPhone, customer.creditScore, customer.notes]
      );
    }

    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 12);
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, permissions, status, last_login, customer_id)
         VALUES ($1,$2,$3,$4,$5,$6,'active',NULL,$7)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, role=EXCLUDED.role, permissions=EXCLUDED.permissions, customer_id=EXCLUDED.customer_id`,
        [user.id, user.name, user.email, passwordHash, user.role, JSON.stringify(permissionsFor(user.role)), user.customerId]
      );
    }

    for (const category of categories) {
      await client.query(
        `INSERT INTO categories (id, name, parent_category_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, parent_category_id=EXCLUDED.parent_category_id`,
        [category.id, category.name, category.parentCategoryId]
      );
    }

    for (const product of products) {
      await client.query(
        `INSERT INTO products (id, name, category_id, price, sku, status, image_url, stock_qty, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, stock_qty=EXCLUDED.stock_qty`,
        [product.id, product.name, product.categoryId, product.price, product.sku, product.status, product.imageUrl, product.stockQty, product.description]
      );
    }

    for (const plan of plans) {
      const outstanding = plan.installmentAmount * plan.numberOfInstallments;
      await client.query(
        `INSERT INTO installment_plans
         (id, customer_id, product_id, principal_amount, down_payment, number_of_installments, installment_amount, frequency, start_date, status, interest_or_markup, outstanding_balance, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, outstanding_balance=EXCLUDED.outstanding_balance`,
        [plan.id, plan.customerId, plan.productId, plan.principalAmount, plan.downPayment, plan.numberOfInstallments, plan.installmentAmount, plan.frequency, plan.startDate, plan.status, plan.interestOrMarkup, outstanding, plan.createdBy]
      );

      for (const schedule of scheduleFor(plan)) {
        await client.query(
          `INSERT INTO installment_schedules (id, plan_id, installment_number, due_date, amount_due, amount_paid, status, paid_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET amount_paid=EXCLUDED.amount_paid, status=EXCLUDED.status, paid_date=EXCLUDED.paid_date`,
          [schedule.id, schedule.planId, schedule.installmentNumber, schedule.dueDate, schedule.amountDue, schedule.amountPaid, schedule.status, schedule.paidDate]
        );
      }
    }

    for (const payment of payments) {
      await client.query(
        `INSERT INTO payments (id, plan_id, schedule_id, customer_id, amount, method, received_by, receipt_number, paid_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [payment.id, payment.planId, payment.scheduleId, payment.customerId, payment.amount, payment.method, payment.receivedBy, payment.receiptNumber, payment.paidAt, payment.notes]
      );
    }
    await client.query(`SELECT setval('payment_receipt_seq', $1, true)`, [payments.length]);

    await client.query(`
      UPDATE installment_plans p
      SET outstanding_balance = totals.total_due - totals.total_paid,
          status = CASE WHEN totals.total_due - totals.total_paid <= 0 THEN 'completed' ELSE p.status END
      FROM (
        SELECT plan_id, COALESCE(sum(amount_due), 0) AS total_due, COALESCE(sum(amount_paid), 0) AS total_paid
        FROM installment_schedules
        GROUP BY plan_id
      ) totals
      WHERE p.id = totals.plan_id
    `);
    await client.query(`
      UPDATE customers c
      SET total_outstanding = totals.total_outstanding
      FROM (
        SELECT customer_id, COALESCE(sum(outstanding_balance), 0) AS total_outstanding
        FROM installment_plans
        GROUP BY customer_id
      ) totals
      WHERE c.id = totals.customer_id
    `);

    await client.query(
      `INSERT INTO notifications (id, user_id, type, message, is_read, related_entity_id)
       VALUES
       ('notif-001','user-001','overdue','Installment overdue for Muhammad Arif Khan - Plan #plan-001',false,'plan-001'),
       ('notif-002','user-001','payment','Payment received: PKR 7,084 from Muhammad Arif Khan',true,'pay-001')
       ON CONFLICT (id) DO NOTHING`
    );
    await client.query(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
       VALUES ('audit-001','system','SYSTEM','Seed','seed','Seed data loaded')
       ON CONFLICT (id) DO NOTHING`
    );
  });

  console.log('Seed data loaded.');
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
