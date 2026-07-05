/**
 * products.js — Products inventory and categories page
 * Features: Search catalog, filter by category, add product, manage categories
 */

import { renderNavbar } from '../components/navbar.js';
import Toast from '../components/toast.js';
import Modal from '../components/modal.js';
import { formatCurrency } from '../config.js';
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from '../mock/products.mock.js';
import AuditService from '../services/audit.service.js';

let state = {
  products: [...MOCK_PRODUCTS],
  categories: [...MOCK_CATEGORIES],
  selectedCategory: '',
  searchQuery: '',
};

export default async function init() {
  renderNavbar('Product Catalog', 'Manage inventory and categories');
  renderPage();
}

function renderPage() {
  const content = document.getElementById('page-content');
  
  // Filter products
  let filtered = state.products;
  if (state.selectedCategory) {
    filtered = filtered.filter(p => p.categoryId === state.selectedCategory);
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.sku.toLowerCase().includes(q)
    );
  }

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Product Catalog</h1>
        <p>${filtered.length} products total</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="manage-cats-btn">Manage Categories</button>
        <button class="btn btn-primary" id="add-product-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Product
        </button>
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
      ${filtered.map(p => `
        <div class="card flex flex-col justify-between" style="position:relative">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span class="badge badge-${p.status}">${p.status.toUpperCase()}</span>
              <span style="font-family:var(--font-mono);font-size:11px;color:var(--color-text-tertiary)">${p.sku}</span>
            </div>
            <h3 style="font-size:18px;margin-bottom:8px">${p.name}</h3>
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
  `;

  // Search input
  document.getElementById('prod-search').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderPage();
  });

  // Category filter click
  document.querySelectorAll('.filter-chip[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.dataset.cat;
      renderPage();
    });
  });

  // Add product
  document.getElementById('add-product-btn').addEventListener('click', showAddProductModal);

  // Manage categories
  document.getElementById('manage-cats-btn').addEventListener('click', showManageCategoriesModal);
}

function showAddProductModal() {
  const contentHtml = `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Product Name *</label>
        <input type="text" id="p-name" class="form-control" placeholder="iPhone 15 Pro" required>
      </div>
      <div class="form-group">
        <label class="form-label">SKU *</label>
        <input type="text" id="p-sku" class="form-control" placeholder="IPH-15P-256" required>
      </div>
      <div class="form-group">
        <label class="form-label">Price (PKR) *</label>
        <input type="number" id="p-price" class="form-control" required>
      </div>
      <div class="form-group">
        <label class="form-label">Initial Stock *</label>
        <input type="number" id="p-stock" class="form-control" value="10" required>
      </div>
      <div class="form-group">
        <label class="form-label">Category *</label>
        <select id="p-cat" class="form-control" required>
          ${state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="p-status" class="form-control">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div class="form-group full-width">
        <label class="form-label">Description</label>
        <textarea id="p-desc" class="form-control" rows="2" placeholder="Specifications..."></textarea>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-confirm">Add Product</button>
  `;

  const modal = Modal.create({ title: 'Add New Product', content: contentHtml, footer });
  modal.open();

  modal.backdrop.querySelector('#modal-cancel').addEventListener('click', modal.destroy);
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

    const newProduct = {
      id: `prod-${Date.now()}`,
      name, sku, price, stockQty, categoryId, status, description
    };

    state.products.push(newProduct);
    await AuditService.log('CREATE', 'Product', newProduct.id, `Added product to inventory: ${name}`);
    Toast.success('Inventory Added', `${name} created successfully.`);
    modal.destroy();
    renderPage();
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
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        state.categories = state.categories.filter(c => c.id !== id);
        updateList();
        renderPage();
      });
    });
  };

  modal.backdrop.querySelector('#add-cat-action').addEventListener('click', () => {
    const input = modal.backdrop.querySelector('#new-cat-name');
    const name = input.value.trim();
    if (!name) return;

    state.categories.push({ id: `cat-${Date.now()}`, name, parentCategoryId: null });
    input.value = '';
    updateList();
    renderPage();
  });

  updateList();
}
