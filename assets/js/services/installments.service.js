/**
 * installments.service.js — Installment plans, schedules, and payments
 *
 * API Endpoints:
 *   GET    /api/installment-plans?customerId=&status=
 *   POST   /api/installment-plans
 *   GET    /api/installment-plans/:id/schedule
 *   POST   /api/payments
 *   GET    /api/payments?planId=&dateFrom=&dateTo=
 *   GET    /api/reports/summary
 *   GET    /api/reports/collections?period=
 */

import { Config } from '../config.js';
import { api } from './api.js';
import { MOCK_INSTALLMENT_PLANS, MOCK_SCHEDULES, MOCK_PAYMENTS } from '../mock/installments.mock.js';
import { MOCK_CUSTOMERS } from '../mock/customers.mock.js';
import AuditService from './audit.service.js';
import EventBus from '../components/event-bus.js';

const delay = (ms = 350) => new Promise(r => setTimeout(r, ms));

let mockPlans    = [...MOCK_INSTALLMENT_PLANS];
let mockSchedule = [...MOCK_SCHEDULES];
let mockPayments = [...MOCK_PAYMENTS];

const InstallmentsService = {
  /** List installment plans, optionally filtered */
  async listPlans({ customerId = '', status = '', page = 1, pageSize = Config.DEFAULT_PAGE_SIZE } = {}) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay();
      let data = [...mockPlans];
      if (customerId) data = data.filter(p => p.customerId === customerId);
      if (status)     data = data.filter(p => p.status === status);

      // Enrich with customer name for display
      data = data.map(p => {
        const customer = MOCK_CUSTOMERS.find(c => c.id === p.customerId);
        return { ...p, customerName: customer?.fullName || 'Unknown' };
      });

      const total = data.length;
      const items = data.slice((page - 1) * pageSize, page * pageSize);
      return {
        success: true,
        data: items,
        error: null,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    }
    return api.get('/installment-plans', { customerId, status, page, pageSize });
  },

  /** Get a single plan by ID */
  async getPlanById(id) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay();
      const plan = mockPlans.find(p => p.id === id);
      if (!plan) return { success: false, data: null, error: 'Plan not found.' };
      const customer = MOCK_CUSTOMERS.find(c => c.id === plan.customerId);
      return { success: true, data: { ...plan, customerName: customer?.fullName || 'Unknown' }, error: null };
    }
    return api.get(`/installment-plans/${id}`);
  },

  /** Create a new installment plan */
  async createPlan(payload) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(600);
      const plan = {
        ...payload,
        id: `plan-${Date.now()}`,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      // Generate schedule rows
      const start = new Date(plan.startDate);
      for (let i = 1; i <= plan.numberOfInstallments; i++) {
        const dueDate = new Date(start);
        if (plan.frequency === 'monthly') dueDate.setMonth(dueDate.getMonth() + (i - 1));
        else dueDate.setDate(dueDate.getDate() + (i - 1) * 7);

        mockSchedule.push({
          id: `sch-${plan.id}-${i}`,
          planId: plan.id,
          installmentNumber: i,
          dueDate: dueDate.toISOString().split('T')[0],
          amountDue: plan.installmentAmount,
          amountPaid: 0,
          status: 'pending',
          paidDate: null,
        });
      }
      mockPlans.push(plan);
      await AuditService.log('CREATE', 'InstallmentPlan', plan.id, `Created plan for customer ${plan.customerId}`);
      EventBus.emit('installment:created', plan);
      return { success: true, data: plan, error: null };
    }
    return api.post('/installment-plans', payload);
  },

  /** Get the installment schedule for a plan */
  async getSchedule(planId) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay();
      const items = mockSchedule.filter(s => s.planId === planId);
      return { success: true, data: items, error: null };
    }
    return api.get(`/installment-plans/${planId}/schedule`);
  },

  /** Record a payment against a schedule row */
  async recordPayment(payload) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(500);
      const payment = {
        ...payload,
        id: `pay-${Date.now()}`,
        paidAt: new Date().toISOString(),
        receiptNumber: `RCP-${new Date().getFullYear()}-${String(mockPayments.length + 1).padStart(4, '0')}`,
      };
      mockPayments.push(payment);

      // Update schedule row
      const schedIdx = mockSchedule.findIndex(s => s.id === payload.scheduleId);
      if (schedIdx !== -1) {
        mockSchedule[schedIdx].amountPaid = payload.amount;
        mockSchedule[schedIdx].status = 'paid';
        mockSchedule[schedIdx].paidDate = payment.paidAt;
      }

      await AuditService.log('CREATE', 'Payment', payment.id, `Payment of PKR ${payload.amount} recorded`);
      EventBus.emit('payment:recorded', payment);
      return { success: true, data: payment, error: null };
    }
    return api.post('/payments', payload);
  },

  /** Revert a payment (admin only) */
  async revertPayment(paymentId, reason) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(500);
      const payment = mockPayments.find(p => p.id === paymentId);
      if (!payment) return { success: false, data: null, error: 'Payment not found.' };
      
      payment.status = 'reversed';
      payment.reversedAt = new Date().toISOString();
      payment.reversalReason = reason;

      const schedIdx = mockSchedule.findIndex(s => s.id === payment.scheduleId);
      if (schedIdx !== -1) {
        mockSchedule[schedIdx].amountPaid = Math.max(0, mockSchedule[schedIdx].amountPaid - payment.amount);
        mockSchedule[schedIdx].status = mockSchedule[schedIdx].amountPaid > 0 ? 'partial' : 'pending';
      }

      await AuditService.log('UPDATE', 'Payment', paymentId, `Reversed payment. Reason: ${reason}`);
      EventBus.emit('payment:recorded', payment); // Trigger re-render
      return { success: true, data: payment, error: null };
    }
    return api.put(`/payments/${paymentId}/reverse`, { reason });
  },

  /** List payments with optional filters */
  async listPayments({ planId = '', dateFrom = '', dateTo = '' } = {}) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay();
      let data = [...mockPayments];
      if (planId)   data = data.filter(p => p.planId === planId);
      if (dateFrom) data = data.filter(p => p.paidAt >= dateFrom);
      if (dateTo)   data = data.filter(p => p.paidAt <= dateTo);
      return { success: true, data, error: null };
    }
    return api.get('/payments', { planId, dateFrom, dateTo });
  },

  /** Get a payment by ID (for receipt) */
  async getPaymentById(id) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay();
      const payment = mockPayments.find(p => p.id === id);
      if (!payment) return { success: false, data: null, error: 'Payment not found.' };
      const plan = mockPlans.find(pl => pl.id === payment.planId);
      const customer = plan ? MOCK_CUSTOMERS.find(c => c.id === plan.customerId) : null;
      return { success: true, data: { ...payment, plan, customer }, error: null };
    }
    return api.get(`/payments/${id}`);
  },

  /** Dashboard summary statistics */
  async getSummary() {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(200);
      // 'active' plans = those with status strictly 'active' (excludes overdue, completed, defaulted)
      const activePlans  = mockPlans.filter(p => p.status === 'active');
      // 'overdue' plans = plans explicitly marked overdue (card links to ?status=overdue)
      const overduePlans = mockPlans.filter(p => p.status === 'overdue');
      const totalOutstanding = MOCK_CUSTOMERS.reduce((s, c) => s + (c.totalOutstanding || 0), 0);
      const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const monthPayments = mockPayments.filter(p => p.paidAt.startsWith(thisMonth));
      const monthlyCollection = monthPayments.reduce((s, p) => s + p.amount, 0);
      const dueSoonCount = mockSchedule.filter(s => s.status === 'due-soon').length;

      return {
        success: true,
        data: {
          totalCustomers: MOCK_CUSTOMERS.filter(c => c.status === 'active').length,
          activePlans: activePlans.length,
          totalOutstanding,
          monthlyCollection,
          // overdueCount = plans with status 'overdue' — consistent with card link
          overdueCount: overduePlans.length,
          dueSoonCount,
          totalRevenue: mockPayments.reduce((s, p) => s + p.amount, 0),
        },
        error: null,
      };
    }
    return api.get('/reports/summary');
  },


  /** Monthly collections for the chart */
  async getCollectionsChart(months = 6) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(300);
      const data = [];
      const now = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleString('en-PK', { month: 'short', year: '2-digit' });
        const monthStr = d.toISOString().slice(0, 7);
        const amount = mockPayments
          .filter(p => p.paidAt.startsWith(monthStr))
          .reduce((s, p) => s + p.amount, 0) || (Math.random() * 80000 + 20000); // fallback for empty months
        data.push({ label, amount: Math.round(amount) });
      }
      return { success: true, data, error: null };
    }
    return api.get('/reports/collections', { period: `last_${months}_months` });
  },

  /** Today's due installments */
  async getTodaysDue() {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(200);
      const today = new Date().toISOString().split('T')[0];
      const due = mockSchedule
        .filter(s => s.dueDate === today || s.status === 'due-soon' || s.status === 'overdue')
        .slice(0, 10)
        .map(s => {
          const plan = mockPlans.find(p => p.id === s.planId);
          const customer = plan ? MOCK_CUSTOMERS.find(c => c.id === plan.customerId) : null;
          return { ...s, customerName: customer?.fullName || 'Unknown', customerPhone: customer?.phone };
        });
      return { success: true, data: due, error: null };
    }
    return api.get('/reports/today-due');
  },
};

export default InstallmentsService;
