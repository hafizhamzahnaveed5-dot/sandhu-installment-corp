/**
 * products.service.js — Product and category management
 *
 * API Endpoints:
 *   GET    /api/products
 *   POST   /api/products
 *   PUT    /api/products/:id
 *   DELETE /api/products/:id
 *   PATCH  /api/products/:id/stock
 */

import { Config } from '../config.js';
import { api } from './api.js';
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from '../mock/products.mock.js';
import { MOCK_INSTALLMENT_PLANS } from '../mock/installments.mock.js';
import AuditService from './audit.service.js';

// Helper for simulating network delay in mock mode
const delay = ms => new Promise(res => setTimeout(res, ms));

const ProductsService = {
  /**
   * List all products with optional category filter
   * @param {string} categoryId - Optional category ID to filter by
   */
  async list({ categoryId = null, search = '', status = '', page = 1, pageSize = Config.DEFAULT_PAGE_SIZE } = {}) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(300);
      let products = [...MOCK_PRODUCTS];
      if (categoryId) {
        products = products.filter(p => p.categoryId === categoryId);
      }
      if (status) {
        products = products.filter(p => p.status === status);
      }
      if (search) {
        const q = search.toLowerCase();
        products = products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
      }
      const total = products.length;
      const paged = products.slice((page - 1) * pageSize, page * pageSize);
      return {
        success: true,
        data: paged,
        error: null,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }

    const params = { page, pageSize };
    if (categoryId) params.categoryId = categoryId;
    if (search) params.search = search;
    if (status) params.status = status;
    return api.get('/products', params);
  },

  async listActive({ search = '', limit = 0 } = {}) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(300);
      let products = [...MOCK_PRODUCTS].filter(p => p.status === 'active');
      if (search) {
        const q = search.toLowerCase();
        products = products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
      }
      return { success: true, data: limit > 0 ? products.slice(0, limit) : products, error: null };
    }
    const params = {};
    if (search) params.search = search;
    if (limit > 0) params.limit = limit;
    return api.get('/products/active', params);
  },

  /**
   * List all categories
   */
  async listCategories() {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(200);
      return { success: true, data: [...MOCK_CATEGORIES], error: null };
    }
    return api.get('/categories', { pageSize: 9999 });
  },

  /**
   * Create a new category
   */
  async createCategory(name, parentCategoryId = null) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(300);
      const cat = { id: `cat-${Date.now()}`, name, parentCategoryId };
      MOCK_CATEGORIES.push(cat);
      return { success: true, data: cat, error: null };
    }
    return api.post('/categories', { name, parentCategoryId });
  },

  /**
   * Delete a category by id
   */
  async deleteCategory(id) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(300);
      const idx = MOCK_CATEGORIES.findIndex(c => c.id === id);
      if (idx !== -1) MOCK_CATEGORIES.splice(idx, 1);
      return { success: true, data: null, error: null };
    }
    return api.delete(`/categories/${id}`);
  },

  /**
   * Create a new product
   */
  async create(payload) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(400);
      const newProduct = {
        id: `prod-${Date.now()}`,
        ...payload
      };
      MOCK_PRODUCTS.push(newProduct);
      return { success: true, data: newProduct, error: null };
    }
    return api.post('/products', payload);
  },

  /**
   * Update an existing product
   */
  async update(id, payload) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(400);
      const idx = MOCK_PRODUCTS.findIndex(p => p.id === id);
      if (idx === -1) return { success: false, data: null, error: 'Product not found' };
      
      MOCK_PRODUCTS[idx] = { ...MOCK_PRODUCTS[idx], ...payload };
      await AuditService.log('UPDATE', 'Product', id, `Updated product details for ${MOCK_PRODUCTS[idx].name}`);
      return { success: true, data: MOCK_PRODUCTS[idx], error: null };
    }
    return api.put(`/products/${id}`, payload);
  },

  /**
   * Update product stock specifically
   */
  async updateStock(id, newStock) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(300);
      const idx = MOCK_PRODUCTS.findIndex(p => p.id === id);
      if (idx === -1) return { success: false, data: null, error: 'Product not found' };
      
      const oldStock = MOCK_PRODUCTS[idx].stockQty;
      MOCK_PRODUCTS[idx].stockQty = newStock;
      
      await AuditService.log('UPDATE', 'Product', id, `Stock quantity changed from ${oldStock} to ${newStock}`);
      return { success: true, data: MOCK_PRODUCTS[idx], error: null };
    }
    return api.patch(`/products/${id}/stock`, { stockQty: newStock });
  },

  /**
   * Delete a product
   */
  async delete(id) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(500);
      // Check for active installment plans
      const isLinked = MOCK_INSTALLMENT_PLANS.some(plan => plan.productId === id && plan.status === 'active');
      if (isLinked) {
        return { success: false, data: null, error: 'This product is linked to active installment plans and cannot be deleted.' };
      }
      
      const idx = MOCK_PRODUCTS.findIndex(p => p.id === id);
      if (idx === -1) return { success: false, data: null, error: 'Product not found' };
      
      const pName = MOCK_PRODUCTS[idx].name;
      MOCK_PRODUCTS.splice(idx, 1);
      
      await AuditService.log('DELETE', 'Product', id, `Deleted product: ${pName}`);
      return { success: true, data: null, error: null };
    }
    return api.delete(`/products/${id}`);
  }
};

export default ProductsService;
