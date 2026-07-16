/**
 * customers.service.js — Customer data operations
 * 
 * Each function: (1) checks MOCK_MODE, (2) if mock, simulates network + returns
 * mock data with the exact API response envelope, (3) if real, calls api.js.
 * 
 * API Endpoints:
 *   GET    /api/customers?search=&status=&page=&pageSize=
 *   GET    /api/customers/:id
 *   POST   /api/customers
 *   PUT    /api/customers/:id
 */

import { Config } from '../config.js';
import { api } from './api.js';
import { MOCK_CUSTOMERS } from '../mock/customers.mock.js';
import { MOCK_INSTALLMENT_PLANS } from '../mock/installments.mock.js';
import AuditService from './audit.service.js';
import EventBus from '../components/event-bus.js';
import InstallmentsService from './installments.service.js';

const delay = (ms = 350) => new Promise(r => setTimeout(r, ms));

// In-memory store for mock creates/updates
let mockStore = [...MOCK_CUSTOMERS];
let mockPlans = [...MOCK_INSTALLMENT_PLANS];

const CustomersService = {
  /**
   * List customers with search, filter, and pagination.
   * @param {object} params — { search, status, page, pageSize }
   */
  async list({ search = '', status = '', page = 1, pageSize = Config.DEFAULT_PAGE_SIZE, view = '' } = {}) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay();
      let data = [...mockStore];

      if (search) {
        const q = search.toLowerCase();
        data = data.filter(c =>
          c.fullName.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.city.toLowerCase().includes(q)
        );
      }
      if (status) data = data.filter(c => c.status === status);

      if (view === 'costs') {
        const totals = mockPlans.reduce((acc, plan) => {
          if (!acc[plan.customerId]) acc[plan.customerId] = { totalPurchaseCost: 0, totalCostGap: 0 };
          acc[plan.customerId].totalPurchaseCost += Number(plan.purchaseCost || 0);
          acc[plan.customerId].totalCostGap += Number((plan.principalAmount || 0) - (plan.purchaseCost || 0));
          return acc;
        }, {});
        data = data.map(c => ({
          ...c,
          totalPurchaseCost: totals[c.id]?.totalPurchaseCost || 0,
          totalCostGap: totals[c.id]?.totalCostGap || 0,
        }));
      }

      const total = data.length;
      const start = (page - 1) * pageSize;
      const items = data.slice(start, start + pageSize);
      return {
        success: true,
        data: items,
        error: null,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    }
    return api.get('/customers', { search, status, page, pageSize, view });
  },

  /**
   * Get a single customer by ID.
   */
  async getById(id) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay();
      const customer = mockStore.find(c => c.id === id);
      if (!customer) return { success: false, data: null, error: 'Customer not found.' };
      return { success: true, data: customer, error: null };
    }
    return api.get(`/customers/${id}`);
  },

  /**
   * Create a new customer.
   */
  async create(payload) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(500);
      const newCustomer = {
        ...payload,
        id: `cust-${Date.now()}`,
        createdAt: new Date().toISOString(),
        documents: [],
        totalOutstanding: 0,
      };
      mockStore.push(newCustomer);
      await AuditService.log('CREATE', 'Customer', newCustomer.id, `Created customer: ${newCustomer.fullName}`);
      EventBus.emit('customer:created', newCustomer);
      return { success: true, data: newCustomer, error: null };
    }
    return api.post('/customers', payload);
  },

  /**
   * Update an existing customer.
   */
  async update(id, payload) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(400);
      const idx = mockStore.findIndex(c => c.id === id);
      if (idx === -1) return { success: false, data: null, error: 'Customer not found.' };
      mockStore[idx] = { ...mockStore[idx], ...payload };
      await AuditService.log('UPDATE', 'Customer', id, `Updated customer: ${mockStore[idx].fullName}`);
      EventBus.emit('customer:updated', mockStore[idx]);
      return { success: true, data: mockStore[idx], error: null };
    }
    return api.put(`/customers/${id}`, payload);
  },

  /**
   * Delete a customer if they do not have open installment plans.
   * Admins may purge fully settled customers (0 outstanding) with forceZero.
   */
  async delete(id, { forceZero = false } = {}) {
    const plansResult = await InstallmentsService.listPlans({ customerId: id, pageSize: 9999 });
    if (!plansResult.success) {
      return { success: false, data: null, error: plansResult.error || 'Unable to verify customer installment plans.' };
    }

    const openStatuses = ['active', 'overdue', 'due-soon', 'pending', 'defaulted'];
    const openPlans = (plansResult.data || []).filter(plan => openStatuses.includes(plan.status));
    if (openPlans.length > 0 && !forceZero) {
      return {
        success: false,
        data: null,
        error: 'This customer has active installment plans and cannot be deleted. Resolve or cancel those plans first.',
      };
    }

    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(400);
      const idx = mockStore.findIndex(c => c.id === id);
      if (idx === -1) return { success: false, data: null, error: 'Customer not found.' };
      const [deletedCustomer] = mockStore.splice(idx, 1);
      await AuditService.log('DELETE', 'Customer', id, `Deleted customer: ${deletedCustomer.fullName}`);
      EventBus.emit('customer:deleted', deletedCustomer);
      return { success: true, data: deletedCustomer, error: null };
    }

    try {
      const path = forceZero ? `/customers/${id}?forceZero=true` : `/customers/${id}`;
      const result = await api.delete(path);
      if (result.success) {
        await AuditService.log('DELETE', 'Customer', id, `Deleted customer ID: ${id}`);
        EventBus.emit('customer:deleted', { id });
      }
      return result;
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err?.body?.error || err?.message || 'Unable to delete customer.',
      };
    }
  },
};

export default CustomersService;
