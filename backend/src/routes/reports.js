import express from 'express';
import { pool } from '../db.js';
import { authenticate, requireMinRole } from '../middleware/auth.js';
import { asyncHandler, ok } from '../utils/respond.js';
import { mapSchedule } from '../services/mappers.js';

const router = express.Router();

router.use(authenticate);
router.use(requireMinRole('agent'));

router.get('/summary', asyncHandler(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM customers WHERE status = 'active') AS total_customers,
      (SELECT count(*)::int FROM installment_plans WHERE status = 'active') AS active_plans,
      (SELECT COALESCE(sum(total_outstanding), 0)::numeric FROM customers) AS total_outstanding,
      (SELECT COALESCE(sum(amount), 0)::numeric FROM payments WHERE date_trunc('month', paid_at) = date_trunc('month', now())) AS monthly_collection,
      (SELECT count(*)::int FROM installment_schedules s WHERE s.status NOT IN ('paid', 'settled') AND s.due_date < CURRENT_DATE) AS overdue_count,
      (SELECT count(*)::int FROM installment_schedules s WHERE s.status NOT IN ('paid', 'settled') AND s.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 days') AS due_soon_count,
      (SELECT COALESCE(sum(amount), 0)::numeric FROM payments) AS total_revenue,
      (SELECT COALESCE(sum(markup_earned), 0)::numeric FROM installment_schedules) AS total_profit,
      (SELECT COALESCE(sum(purchase_cost), 0)::numeric FROM installment_plans) AS total_purchase_cost,
      (SELECT COALESCE(sum(principal_amount - purchase_cost), 0)::numeric FROM installment_plans) AS total_cost_gap,
      (SELECT COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0)::numeric FROM roznamcha_entries WHERE entry_date = CURRENT_DATE) AS roznamcha_purchase_today,
      (SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)::numeric FROM roznamcha_entries WHERE entry_date = CURRENT_DATE) AS roznamcha_expense_today,
      (SELECT COALESCE(SUM(CASE WHEN type = 'payment_received' THEN amount ELSE 0 END), 0)::numeric FROM roznamcha_entries WHERE entry_date = CURRENT_DATE) AS roznamcha_payment_today,
      (SELECT count(*)::int FROM users WHERE status = 'active') AS active_users,
      (SELECT count(*)::int FROM payments WHERE status = 'posted' AND paid_at::date = CURRENT_DATE) AS payments_today_count,
      (SELECT COALESCE(sum(amount), 0)::numeric FROM payments WHERE status = 'posted' AND paid_at::date = CURRENT_DATE) AS payments_today_amount
  `);
  const row = result.rows[0];
  const purchaseToday = Number(row.roznamcha_purchase_today || 0);
  const expenseToday = Number(row.roznamcha_expense_today || 0);
  const paymentToday = Number(row.roznamcha_payment_today || 0);
  return ok(res, {
    totalCustomers: row.total_customers,
    activePlans: row.active_plans,
    totalOutstanding: Number(row.total_outstanding),
    monthlyCollection: Number(row.monthly_collection),
    overdueCount: row.overdue_count,
    dueSoonCount: row.due_soon_count,
    totalRevenue: Number(row.total_revenue),
    totalProfit: Number(row.total_profit),
    totalPurchaseCost: Number(row.total_purchase_cost),
    totalCostGap: Number(row.total_cost_gap),
    activeUsers: row.active_users,
    paymentsTodayCount: row.payments_today_count,
    paymentsTodayAmount: Number(row.payments_today_amount || 0),
    roznamchaToday: {
      purchaseTotal: purchaseToday,
      expenseTotal: expenseToday,
      paymentTotal: paymentToday,
      combinedTotal: purchaseToday + expenseToday + paymentToday,
      net: paymentToday - (purchaseToday + expenseToday),
    },
  });
}));

router.get('/collections', asyncHandler(async (req, res) => {
  const match = String(req.query.period || 'last_6_months').match(/last_(\d+)_months/);
  const months = Math.min(Math.max(Number(match?.[1] || 6), 1), 24);
  const result = await pool.query(
    `WITH series AS (
       SELECT date_trunc('month', now()) - (($1::int - gs) * interval '1 month') AS month_start
       FROM generate_series(1, $1::int) AS gs
     )
     SELECT to_char(month_start, 'Mon YY') AS label, COALESCE(sum(p.amount), 0)::numeric AS amount
     FROM series
     LEFT JOIN payments p ON date_trunc('month', p.paid_at) = series.month_start
     GROUP BY month_start
     ORDER BY month_start`,
    [months]
  );
  return ok(res, result.rows.map((row) => ({ label: row.label, amount: Number(row.amount) })));
}));

router.get('/today-due', asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT
       c.id AS customer_id,
       c.full_name AS customer_name,
       c.phone AS customer_phone,
       COUNT(*)::int AS overdue_count,
       COALESCE(SUM(GREATEST(s.amount_due - s.amount_paid, 0)), 0)::numeric AS total_overdue_amount,
       MIN(s.due_date)::date AS oldest_due_date
     FROM installment_schedules s
     JOIN installment_plans p ON p.id = s.plan_id
     JOIN customers c ON c.id = p.customer_id
     WHERE s.status NOT IN ('paid', 'settled')
       AND s.due_date <= CURRENT_DATE + INTERVAL '2 days'
     GROUP BY c.id, c.full_name, c.phone
     ORDER BY MIN(s.due_date) ASC
     LIMIT 10`
  );
  return ok(res, result.rows.map((row) => ({
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    overdueCount: row.overdue_count,
    totalOverdueAmount: Number(row.total_overdue_amount),
    oldestDueDate: row.oldest_due_date,
    status: 'overdue',
  })));
}));

export default router;
