/**
 * products.js — Products inventory and categories page
 * Features: Search catalog, filter by category, add product, manage categories
 */

import { renderNavbar } from '../components/navbar.js';
import Toast from '../components/toast.js';
import Modal from '../components/modal.js';
import { formatCurrency, Config } from '../config.js';
import ProductsService from '../services/products.service.js';
import AuthService from '../services/auth.service.js';

let state = {
  products: [],
  categories: [],
  selectedCategory: '',
  searchQuery: '',
  page: 1,
  pageSize: Config.DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

export default async function init() {
  renderNavbar('Product Catalog', 'Manage inventory and categories');
  
  try {
    const catRes = await ProductsService.listCategories();
    if (catRes.success) {
      state.categories = catRes.data;
    } else {
      Toast.error('Error', catRes.error || 'Failed to load categories.');
    }
  } catch (err) {
    Toast.error('Error', err.body?.error || err.message || 'Failed to load categories.');
  }

  await loadProducts({ page: 1 });
}

async function loadProducts({ categoryId = state.selectedCategory, search = state.searchQuery } = {}) {
  state.selectedCategory = categoryId || '';
  state.searchQuery = search;
  state.page = 1;
  state.pageSize = Config.DEFAULT_PAGE_SIZE;

  try {
    const result = await ProductsService.list({
      categoryId: categoryId || null,
      search: state.searchQuery,
      page: 1,
      pageSize: state.pageSize,
    });

    if (result.success) {
      state.products = result.data;
      state.total = result.pagination?.total || result.data?.length || 0;
      state.totalPages = 1;
    } else {
      state.products = [];
      state.total = 0;
      state.totalPages = 1;
      Toast.error('Error', result.error || 'Failed to load products.');
    }
  } catch (err) {
    state.products = [];
    state.total = 0;
    state.totalPages = 1;
    Toast.error('Error', err.body?.error || err.message || 'Failed to load products.');
  }

  renderPage();
}

function renderPage() {
  const content = document.getElementById('page-content');
  
  const canEdit = AuthService.isAdmin() || AuthService.isManager();
  const products = state.products || [];

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Product Catalog</h1>
        <p>${state.total} product${state.total !== 1 ? 's' : ''} total</p>
      </div>
      <div class="page-header-actions">
        ${canEdit ? `<button class="btn btn-secondary" id="manage-cats-btn">Manage Categories</button>
        <button class="btn btn-primary" id="add-product-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Product
        </button>` : ''}
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="search-input" style="flex:1;max-width:300px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="prod-search" placeholder="Search by name or SKU..." value="${state.searchQuery}">
      </div>
      <div class="flex gap-2">
        <button class="filter-chip ${state.selectedCategory === '' ? 'active' : ''}" data-cat="">All Categories</button>
        ${state.categories.map(c => `
          <button class="filter-chip ${state.selectedCategory === c.id ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>
        `).join('')}
      </div>
    </div>

    <!-- Inventory Grid -->
    <div class="grid grid-cols-3 gap-6" style="margin-top:var(--space-6)">
      ${state.products.map(p => `
        <div class="card flex flex-col justify-between" style="position:relative">
          ${canEdit ? `
          <div style="position:absolute;top:16px;right:16px;display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm text-secondary update-stock-btn" data-id="${p.id}" title="Update Stock">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            </button>
            <button class="btn btn-ghost btn-sm text-secondary edit-product-btn" data-id="${p.id}" title="Edit Product">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
          </div>` : ''}
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span class="badge badge-${p.status}">${p.status.toUpperCase()}</span>
              <span style="font-family:var(--font-mono);font-size:11px;color:var(--color-text-tertiary)">${p.sku}</span>
            </div>
            <h3 style="font-size:18px;margin-bottom:8px;padding-right:60px">${p.name}</h3>
            <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px">${p.description || 'No description'}</p>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--color-border);padding-top:16px;margin-top:16px">
            <div>
              <div style="font-size:11px;color:var(--color-text-tertiary)">Stock Qty</div>
              <div style="font-weight:600;font-size:15px;color:${p.stockQty > 0 ? 'var(--color-text-primary)' : 'var(--color-accent-red)'}">${p.stockQty} left</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:var(--color-text-tertiary)">Retail Price</div>
              <div style="font-weight:700;font-size:18px;color:var(--color-accent-blue);font-family:var(--font-mono)">${formatCurrency(p.price)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="pagination-container" style="margin-top:24px;display:flex;justify-content:space-between;align-items:center">
      <div id="pagination-info" class="text-secondary"></div>
    </div>
  `;

  // Search input
  document.getElementById('prod-search').addEventListener('input', e => {
    loadProducts({ search: e.target.value });
  });

  // Category filter click
  document.querySelectorAll('.filter-chip[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      loadProducts({ categoryId: btn.dataset.cat || null, search: state.searchQuery });
    });
  });

  if (canEdit) {
    document.getElementById('add-product-btn').addEventListener('click', () => showProductModal());
    document.getElementById('manage-cats-btn').addEventListener('click', showManageCategoriesModal);
    
    document.querySelectorAll('.edit-product-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = state.products.find(p => p.id === btn.dataset.id);
        if (prod) showProductModal(prod);
      });
    });

    document.querySelectorAll('.update-stock-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prod = state.products.find(p => p.id === btn.dataset.id);
        if (prod) showUpdateStockModal(prod);
      });
    });
  }

  renderPagination();
}

function renderPagination() {
  const info = document.getElementById('pagination-info');
  if (!info) return;
  info.textContent = state.total === 0
    ? 'No products found'
    : `Showing all ${state.total} product${state.total !== 1 ? 's' : ''}`;
}

function showProductModal(product = null) {
  const isEdit = !!product;
  const contentHtml = `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Product Name *</label>
        <input type="text" id="p-name" class="form-control" placeholder="iPhone 15 Pro" value="${isEdit ? product.name : ''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">SKU *</label>
        <input type="text" id="p-sku" class="form-control" placeholder="IPH-15P-256" value="${isEdit ? product.sku : ''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Price (PKR) *</label>
        <input type="number" id="p-price" class="form-control" value="${isEdit ? product.price : ''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">${isEdit ? 'Current Stock *' : 'Initial Stock *'}</label>
        <input type="number" id="p-stock" class="form-control" value="${isEdit ? product.stockQty : '10'}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Category *</label>
        <select id="p-cat" class="form-control" required>
          <option value="">Select category</option>
          ${state.categories.map(c => `<option value="${c.id}" ${isEdit && product.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="p-status" class="form-control">
          <option value="active" ${isEdit && product.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${isEdit && product.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
      <div class="form-group full-width">
        <label class="form-label">Description</label>
        <textarea id="p-desc" class="form-control" rows="2" placeholder="Specifications...">${isEdit ? (product.description || '') : ''}</textarea>
      </div>
    </div>
  `;

  const footer = `
    <div style="flex:1">
      ${isEdit ? `<button class="btn btn-ghost text-danger" id="modal-delete">Delete Product</button>` : ''}
    </div>
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-confirm">${isEdit ? 'Save Changes' : 'Add Product'}</button>
  `;

  const modal = Modal.create({ title: isEdit ? 'Edit Product' : 'Add New Product', content: contentHtml, footer });
  modal.open();

  modal.backdrop.querySelector('#modal-cancel').addEventListener('click', modal.destroy);
  
  if (isEdit) {
    modal.backdrop.querySelector('#modal-delete').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;
      
      const btn = modal.backdrop.querySelector('#modal-delete');
      btn.classList.add('loading');
      
      const result = await ProductsService.delete(product.id);
      if (result.success) {
        state.products = state.products.filter(p => p.id !== product.id);
        Toast.success('Product Deleted', 'The product was removed.');
        modal.destroy();
        renderPage();
      } else {
        btn.classList.remove('loading');
        Toast.error('Delete Failed', result.error);
      }
    });
  }

  modal.backdrop.querySelector('#modal-confirm').addEventListener('click', async () => {
    const name = modal.backdrop.querySelector('#p-name').value.trim();
    const sku = modal.backdrop.querySelector('#p-sku').value.trim();
    const price = parseFloat(modal.backdrop.querySelector('#p-price').value);
    const stockQty = parseInt(modal.backdrop.querySelector('#p-stock').value);
    const categoryId = modal.backdrop.querySelector('#p-cat').value;
    const status = modal.backdrop.querySelector('#p-status').value;
    const description = modal.backdrop.querySelector('#p-desc').value.trim();

    if (!name || !sku || isNaN(price) || isNaN(stockQty)) {
      Toast.warning('Validation', 'Please fill all required fields.');
      return;
    }

    if (!categoryId) {
      Toast.warning('Validation', 'Please select a category.');
      return;
    }

    const payload = { name, sku, price, stockQty, categoryId, status, description };
    const btn = modal.backdrop.querySelector('#modal-confirm');
    btn.classList.add('loading');

    try {
      const result = isEdit 
        ? await ProductsService.update(product.id, payload)
        : await ProductsService.create(payload);

      if (result.success) {
        if (isEdit) {
          const idx = state.products.findIndex(p => p.id === product.id);
          if (idx !== -1) state.products[idx] = result.data;
          Toast.success('Product Updated', `${name} saved successfully.`);
        } else {
          state.products.push(result.data);
          Toast.success('Inventory Added', `${name} created successfully.`);
        }
        modal.destroy();
        renderPage();
      } else {
        Toast.error('Error', result.error || 'An unexpected error occurred.');
      }
    } catch (err) {
      Toast.error('Error', err.body?.error || err.message || 'An unexpected error occurred.');
    } finally {
      btn.classList.remove('loading');
    }
  });
}

function showUpdateStockModal(product) {
  const contentHtml = `
    <div style="margin-bottom:16px">
      <div style="font-weight:500;margin-bottom:4px">${product.name}</div>
      <div style="font-size:13px;color:var(--color-text-secondary)">SKU: ${product.sku}</div>
    </div>
    <div class="form-group">
      <label class="form-label">New Stock Quantity *</label>
      <input type="number" id="quick-stock-qty" class="form-control" value="${product.stockQty}" required>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-confirm">Update Stock</button>
  `;

  const modal = Modal.create({ title: 'Update Stock', content: contentHtml, footer, width: '400px' });
  modal.open();

  modal.backdrop.querySelector('#modal-cancel').addEventListener('click', modal.destroy);
  modal.backdrop.querySelector('#modal-confirm').addEventListener('click', async () => {
    const stockQty = parseInt(modal.backdrop.querySelector('#quick-stock-qty').value);
    
    if (isNaN(stockQty)) {
      Toast.warning('Validation', 'Enter a valid stock number.');
      return;
    }

    const btn = modal.backdrop.querySelector('#modal-confirm');
    btn.classList.add('loading');

    const result = await ProductsService.updateStock(product.id, stockQty);
    if (result.success) {
      const idx = state.products.findIndex(p => p.id === product.id);
      if (idx !== -1) state.products[idx] = result.data;
      Toast.success('Stock Updated', `${product.name} stock set to ${stockQty}.`);
      modal.destroy();
      renderPage();
    } else {
      btn.classList.remove('loading');
      Toast.error('Error', result.error);
    }
  });
}

function showManageCategoriesModal() {
  const contentHtml = `
    <div style="margin-bottom:16px">
      <div style="display:flex;gap:8px">
        <input type="text" id="new-cat-name" class="form-control" placeholder="Category Name" style="flex:1">
        <button class="btn btn-primary" id="add-cat-action">Add</button>
      </div>
    </div>
    <div class="table-wrapper" style="max-height:260px;overflow-y:auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Category Name</th>
            <th style="text-align:right">Action</th>
          </tr>
        </thead>
        <tbody id="cats-tbody">
          ${state.categories.map(c => `
            <tr>
              <td>${c.name}</td>
              <td style="text-align:right">
                <button class="btn btn-ghost btn-sm text-danger remove-cat-btn" data-id="${c.id}">Remove</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const modal = Modal.create({ title: 'Manage Categories', content: contentHtml });
  modal.open();

  const tbody = modal.backdrop.querySelector('#cats-tbody');

  const updateList = () => {
    tbody.innerHTML = state.categories.map(c => `
      <tr>
        <td>${c.name}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm text-danger remove-cat-btn" data-id="${c.id}">Remove</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.remove-cat-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.classList.add('loading');
        const result = await ProductsService.deleteCategory(id);
        if (result.success) {
          state.categories = state.categories.filter(c => c.id !== id);
          updateList();
          renderPage();
        } else {
          btn.classList.remove('loading');
          Toast.error('Delete Failed', result.error || 'Could not delete category.');
        }
      });
    });
  };

  modal.backdrop.querySelector('#add-cat-action').addEventListener('click', async () => {
    const input = modal.backdrop.querySelector('#new-cat-name');
    const name = input.value.trim();
    if (!name) return;

    const addBtn = modal.backdrop.querySelector('#add-cat-action');
    addBtn.classList.add('loading');

    const result = await ProductsService.createCategory(name);
    if (result.success) {
      state.categories.push(result.data);
      input.value = '';
      updateList();
      renderPage();
    } else {
      Toast.error('Create Failed', result.error || 'Could not create category.');
    }
    addBtn.classList.remove('loading');
  });

  updateList();
}
