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
      const round2 = (value) => Number(Number(value || 0).toFixed(2));
      const principalAmount = Number(payload.principalAmount || 0);
      const purchaseCost = Number(payload.purchaseCost || 0);
      const fileFee = Number(payload.fileFee || 0);
      const discountAmount = Number(payload.discountAmount ?? 0);
      const downPayment = Number(payload.downPayment || 0);
      const markupRate = Number(payload.interestOrMarkup || 0);
      const installmentAmount = Number(payload.installmentAmount || 0);
      const netFinanced = round2(Math.max(principalAmount - downPayment, 0));
      const totalMarkup = round2(principalAmount * (markupRate / 100));
      const grossPayable = round2(netFinanced + totalMarkup + fileFee);
      if (discountAmount >= grossPayable) {
        return { success: false, data: null, error: 'Discount cannot be greater than or equal to the total payable amount.' };
      }
      if (installmentAmount <= 0) {
        return { success: false, data: null, error: 'Installment amount must be greater than 0.' };
      }

      const regularInstallments = installmentAmount > 0 ? Math.floor(grossPayable / installmentAmount) : 0;
      const remainder = round2(grossPayable - (regularInstallments * installmentAmount));
      const scheduleAmounts = Array(regularInstallments).fill(installmentAmount);
      if (remainder > 0) scheduleAmounts.push(remainder);
      if (scheduleAmounts.length === 0 && grossPayable > 0) scheduleAmounts.push(grossPayable);

      let discountRemaining = discountAmount;
      for (let i = scheduleAmounts.length - 1; i >= 0 && discountRemaining > 0; i -= 1) {
        const reduction = Math.min(scheduleAmounts[i], discountRemaining);
        scheduleAmounts[i] = round2(scheduleAmounts[i] - reduction);
        discountRemaining = round2(discountRemaining - reduction);
      }
      if (discountRemaining > 0) {
        return { success: false, data: null, error: 'Discount cannot be applied without making the last installment invalid.' };
      }

      const totalPayable = round2(scheduleAmounts.reduce((sum, amount) => sum + amount, 0));

      let markupAllocated = 0;
      const scheduleRows = scheduleAmounts.map((amountDue, idx) => {
        const isLast = idx === scheduleAmounts.length - 1;
        const markupAmount = isLast
          ? round2(totalMarkup - markupAllocated)
          : round2(totalMarkup * (amountDue / totalPayable));
        markupAllocated = round2(markupAllocated + markupAmount);
        const principalDue = round2(amountDue - markupAmount);
        return { amountDue, markupAmount, principalDue };
      });

      const plan = {
        ...payload,
        costGap: principalAmount - purchaseCost,
        numberOfInstallments: scheduleRows.length,
        id: `plan-${Date.now()}`,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      const start = new Date(plan.startDate);

      for (let i = 0; i < scheduleRows.length; i++) {
        const dueDate = new Date(start);
        if (plan.frequency === 'monthly') dueDate.setMonth(dueDate.getMonth() + i);
        else dueDate.setDate(dueDate.getDate() + i * 7);

        mockSchedule.push({
          id: `sch-${plan.id}-${i + 1}`,
          planId: plan.id,
          installmentNumber: i + 1,
          dueDate: dueDate.toISOString().split('T')[0],
          amountDue: scheduleRows[i].amountDue,
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

  /** Delete a plan if no payment history exists */
  async deletePlan(id) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(400);
      const planIdx = mockPlans.findIndex(p => p.id === id);
      if (planIdx === -1) return { success: false, data: null, error: 'Plan not found.' };

      const hasPayments = mockPayments.some(payment => payment.planId === id);
      if (hasPayments) {
        return { success: false, data: null, error: 'This plan has recorded payment history and cannot be deleted.' };
      }

      mockSchedule = mockSchedule.filter(schedule => schedule.planId !== id);
      mockPayments = mockPayments.filter(payment => payment.planId !== id);
      mockPlans.splice(planIdx, 1);

      await AuditService.log('DELETE', 'InstallmentPlan', id, `Deleted plan ${id}`);
      EventBus.emit('installment:deleted', { id });
      return { success: true, data: { id }, error: null };
    }
    return api.delete(`/installment-plans/${id}`);
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
        paidAt: payload.paidAt || new Date().toISOString(),
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
  async listPayments({ planId = '', dateFrom = '', dateTo = '', pageSize = Config.DEFAULT_PAGE_SIZE, includeReversed = true } = {}) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay();
      let data = [...mockPayments];
      if (planId)   data = data.filter(p => p.planId === planId);
      if (dateFrom) data = data.filter(p => p.paidAt >= dateFrom);
      if (dateTo)   data = data.filter(p => p.paidAt <= dateTo);
      return { success: true, data, error: null };
    }
    return api.get('/payments', {
      planId,
      dateFrom,
      dateTo,
      pageSize,
      includeReversed: includeReversed ? 'true' : 'false',
    });
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
      const totalPurchaseCost = activePlans.reduce((sum, plan) => sum + (plan.purchaseCost || 0), 0);
      const totalCostGap = activePlans.reduce((sum, plan) => sum + ((plan.principalAmount || 0) - (plan.purchaseCost || 0)), 0);
      const roznamchaToday = {
        purchaseTotal: 0,
        expenseTotal: 0,
        combinedTotal: 0,
      };

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
          totalPurchaseCost,
          totalCostGap,
          roznamchaToday,
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

  /**
   * Get a live breakdown of what it would cost to settle a plan early right now.
   * Returns: { remainingPrincipal, markupEarnedToDate, markupToWaive, settlementAmount, asOfDate }
   */
  async getSettlementPreview(planId) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(400);
      const plan = mockPlans.find(p => p.id === planId);
      if (!plan) return { success: false, data: null, error: 'Plan not found.' };

      const schedules = mockSchedule.filter(s => s.planId === planId);
      const today = new Date().toISOString().slice(0, 10);
      const open = schedules.filter(s => s.status !== 'paid' && s.status !== 'settled');

      const remainingPrincipal = open.reduce(
        (sum, s) => sum + Math.max(0, (s.principalDue || 0) - (s.principalPaid || 0)), 0
      );
      const markupEarnedToDate = open
        .filter(s => s.dueDate <= today)
        .reduce((sum, s) => sum + (s.markupAmount || 0), 0);
      const markupToWaive = open
        .filter(s => s.dueDate > today)
        .reduce((sum, s) => sum + (s.markupAmount || 0), 0);

      return {
        success: true,
        data: {
          planId,
          asOfDate: today,
          remainingPrincipal: +remainingPrincipal.toFixed(2),
          markupEarnedToDate: +markupEarnedToDate.toFixed(2),
          markupToWaive: +markupToWaive.toFixed(2),
          settlementAmount: +(remainingPrincipal + markupEarnedToDate).toFixed(2),
          hasOpenRows: open.length > 0,
          openRowCount: open.length,
        },
        error: null,
      };
    }
    return api.get(`/installment-plans/${planId}/settlement-preview`);
  },

  /**
   * Execute early settlement — one consolidated payment, all rows closed.
   * @param {string} planId
   * @param {{ method: string, notes?: string }} opts
   */
  async settleEarly(planId, { method, notes = '', paidAt = '' } = {}) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(600);
      const planIdx = mockPlans.findIndex(p => p.id === planId);
      if (planIdx === -1) return { success: false, data: null, error: 'Plan not found.' };

      const plan = mockPlans[planIdx];
      if (plan.status === 'completed') return { success: false, data: null, error: 'Plan is already completed.' };

      const preview = await this.getSettlementPreview(planId);
      if (!preview.success) return preview;
      const b = preview.data;

      const today = paidAt || new Date().toISOString().slice(0, 10);

      // Close all open schedule rows
      mockSchedule.forEach((s, i) => {
        if (s.planId !== planId) return;
        if (s.status === 'paid' || s.status === 'settled') return;
        if (s.dueDate > today) {
          mockSchedule[i] = { ...s, status: 'settled', markupWaived: s.markupAmount || 0, markupEarned: 0, amountDue: s.principalDue, amountPaid: s.principalDue, paidDate: today, closedReason: 'early-settlement' };
        } else {
          mockSchedule[i] = { ...s, status: 'paid', markupEarned: s.markupAmount || 0, amountPaid: s.amountDue, paidDate: today, closedReason: 'early-settlement-paid-through-date' };
        }
      });

      // Mark plan completed
      mockPlans[planIdx] = { ...plan, status: 'completed', outstandingBalance: 0, markupWaived: b.markupToWaive, settledEarlyAt: new Date().toISOString() };

      const payment = {
        id: `pay-settle-${Date.now()}`,
        planId,
        scheduleId: null,
        amount: b.settlementAmount,
        method,
        notes,
        isEarlySettlement: true,
        markupWaived: b.markupToWaive,
        receiptNumber: `RCP-${new Date().getFullYear()}-SETTLE`,
        paidAt: new Date().toISOString(),
        status: 'posted',
      };
      mockPayments.push(payment);

      await AuditService.log('UPDATE', 'InstallmentPlan', planId, `Plan settled early: PKR ${b.settlementAmount}; markup waived PKR ${b.markupToWaive}`);
      EventBus.emit('payment:recorded', payment);
      return { success: true, data: payment, error: null };
    }
    return api.post(`/installment-plans/${planId}/settle`, { method, notes, paidAt });
  },
};

export default InstallmentsService;
