/**
 * customers.js — Customer list page
 * Features: search, status filter, pagination, sortable table, add customer modal
 */

import { renderNavbar } from '../components/navbar.js';
import CustomersService from '../services/customers.service.js';
import Toast from '../components/toast.js';
import { openCustomerFormModal } from '../components/customer-form-modal.js';
import { formatDate, formatCurrency, getInitials, debounce, Config } from '../config.js';

let state = {
  page: 1,
  search: '',
  status: '',
  view: '',
  total: 0,
  totalPages: 1,
};

export default async function init() {
  renderNavbar('Customers', 'Manage your customer database');

  // Read query param for pre-filtering (e.g. #/customers?status=active from dashboard card)
  const hashPart = window.location.hash || '';
  const qpStr = hashPart.includes('?') ? hashPart.split('?')[1] : '';
  const qp = new URLSearchParams(qpStr);
  const preStatus = qp.get('status') || '';
  const preView = qp.get('view') || '';
  if (preStatus) {
    state.status = preStatus;
    state.page = 1;
  }
  if (preView) {
    state.view = preView;
    state.page = 1;
  }

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>${state.view === 'costs' ? 'Customer Purchase Cost View' : 'Customers'}</h1>
        <p id="customer-count">Loading...</p>
      </div>
      <div class="page-header-actions" style="display:flex;gap:8px;align-items:center">
        ${state.view === 'costs' ? `<a class="btn btn-ghost btn-sm" href="#/customers">Standard View</a>` : ''}
        <button class="btn btn-secondary btn-sm" id="export-csv-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </button>
        <button class="btn btn-primary" id="add-customer-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Customer
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="search-input" style="flex:1;max-width:380px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" id="search-input" placeholder="Search by ID, name, phone, or city..." value="${state.search}" />
      </div>
      <div class="flex gap-2">
        <button class="filter-chip ${state.status === '' ? 'active' : ''}" data-status="">All</button>
        <button class="filter-chip ${state.status === 'active' ? 'active' : ''}" data-status="active">Active</button>
        <button class="filter-chip ${state.status === 'inactive' ? 'active' : ''}" data-status="inactive">Inactive</button>
        <button class="filter-chip ${state.status === 'blacklisted' ? 'active' : ''}" data-status="blacklisted">Blacklisted</button>
      </div>
    </div>

    <!-- Table -->
    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrapper" style="border:none;border-radius:0" id="table-wrapper">
        <table class="data-table" id="customers-table">
          <thead>
            <tr>
              <th>Customer ID</th>
              <th>Customer</th>
              <th>Phone</th>
              <th class="hide-mobile">City</th>
              <th class="hide-mobile">Outstanding</th>
              ${state.view === 'costs' ? '<th class="hide-mobile">Purchase Cost</th><th class="hide-mobile">Cost Gap</th>' : ''}
              <th>Status</th>
              <th class="hide-mobile">Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="customers-tbody">
            ${renderTableSkeleton(7, state.view === 'costs' ? 10 : 8)}
          </tbody>
        </table>
      </div>
      <!-- Pagination -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-top:1px solid var(--color-border)">
        <div style="font-size:13px;color:var(--color-text-tertiary)" id="pagination-info">Loading...</div>
        <div class="pagination" id="pagination"></div>
      </div>
    </div>
  `;

  // Search
  document.getElementById('search-input')?.addEventListener('input', debounce(async e => {
    state.search = e.target.value;
    state.page = 1;
    await loadCustomers();
  }));

  // Status filters
  document.querySelectorAll('.filter-chip[data-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.filter-chip[data-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.status = btn.dataset.status;
      state.page = 1;
      await loadCustomers();
    });
  });

  // Add customer
  document.getElementById('add-customer-btn')?.addEventListener('click', showAddCustomerModal);

  // Export CSV
  document.getElementById('export-csv-btn')?.addEventListener('click', exportCsv);

  await loadCustomers();
}

async function loadCustomers() {
  const result = await CustomersService.list({
    search: state.search,
    status: state.status,
    page: state.page,
    pageSize: Config.DEFAULT_PAGE_SIZE,
    view: state.view,
  });

  if (!result.success) {
    Toast.error('Load failed', result.error);
    return;
  }

  state.total = result.pagination.total;
  state.totalPages = result.pagination.totalPages;

  document.getElementById('customer-count').textContent =
    `${state.total} customer${state.total !== 1 ? 's' : ''}${state.search ? ' matching "' + state.search + '"' : ''}${state.view === 'costs' ? ' — purchase cost summary' : ''}`;

  renderTable(result.data);
  renderPagination();
}

function renderTable(customers) {
  const tbody = document.getElementById('customers-tbody');
  if (!tbody) return;

  if (customers.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="${state.view === 'costs' ? 10 : 8}">
        <div class="empty-state">
          <span style="font-size:40px">👥</span>
          <h3>No customers found</h3>
          <p>Try adjusting your search or filters.</p>
        </div>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr onclick="window.location.hash='/customers/${c.id}'" data-id="${c.id}">
      <td>
        <div style="font-family:var(--font-mono);font-weight:700;color:var(--color-accent-blue)">
          ${c.accountNumber ? escapeHtml(c.accountNumber) : '<span style="color:var(--color-accent-amber);font-weight:600">Set ID</span>'}
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar avatar-sm">${getInitials(c.fullName)}</div>
          <div>
            <div style="font-weight:500">${escapeHtml(c.fullName)}</div>
            <div style="font-size:12px;color:var(--color-text-tertiary)">${escapeHtml(c.email || '')}</div>
          </div>
        </div>
      </td>
      <td class="mono secondary">${escapeHtml(c.phone || '')}</td>
      <td class="hide-mobile secondary">${escapeHtml(c.city || '')}</td>
      <td class="hide-mobile" style="font-weight:600;font-family:var(--font-mono)">
        ${c.totalOutstanding > 0 ? formatCurrency(c.totalOutstanding) : '<span style="color:var(--color-accent-green)">Cleared</span>'}
      </td>
      ${state.view === 'costs' ? `
      <td class="hide-mobile" style="font-weight:600;font-family:var(--font-mono);color:var(--color-accent-yellow)">${c.totalPurchaseCost ? formatCurrency(c.totalPurchaseCost) : formatCurrency(0)}</td>
      <td class="hide-mobile" style="font-weight:600;font-family:var(--font-mono);color:var(--color-accent-orange)">${formatCurrency(c.totalCostGap || 0)}</td>
      ` : ''}
      <td><span class="badge badge-${c.status}">${capitalize(c.status)}</span></td>
      <td class="hide-mobile secondary">${formatDate(c.createdAt)}</td>
      <td>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <a href="#/customers/${c.id}" class="btn btn-ghost btn-icon btn-sm" title="View" onclick="event.stopPropagation()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </a>
          <button class="btn btn-ghost btn-icon btn-sm edit-customer-btn" title="Edit Customer ID & details" data-id="${c.id}" onclick="event.stopPropagation()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-customer-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const result = await CustomersService.getById(btn.dataset.id);
      if (!result.success) {
        Toast.error('Edit failed', result.error);
        return;
      }

      openCustomerFormModal({
        mode: 'edit',
        customer: result.data,
        onSaved: async () => loadCustomers(),
        onDeleted: async () => {
          if (state.page > 1 && state.total - 1 <= (state.page - 1) * Config.DEFAULT_PAGE_SIZE) {
            state.page--;
          }
          await loadCustomers();
        },
      });
    });
  });
}

function renderPagination() {
  const info = document.getElementById('pagination-info');
  const pag = document.getElementById('pagination');
  if (!info || !pag) return;

  const start = (state.page - 1) * Config.DEFAULT_PAGE_SIZE + 1;
  const end   = Math.min(state.page * Config.DEFAULT_PAGE_SIZE, state.total);
  info.textContent = state.total > 0 ? `Showing ${start}–${end} of ${state.total}` : 'No results';

  if (state.totalPages <= 1) { pag.innerHTML = ''; return; }

  const pages = [];
  for (let i = 1; i <= state.totalPages; i++) {
    if (i === 1 || i === state.totalPages || (i >= state.page - 1 && i <= state.page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  pag.innerHTML = `
    <button class="page-btn" id="prev-btn" ${state.page <= 1 ? 'disabled' : ''}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    ${pages.map(p => typeof p === 'number'
      ? `<button class="page-btn ${p === state.page ? 'active' : ''}" data-page="${p}">${p}</button>`
      : `<span style="padding:0 6px;color:var(--color-text-tertiary)">…</span>`
    ).join('')}
    <button class="page-btn" id="next-btn" ${state.page >= state.totalPages ? 'disabled' : ''}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  `;

  pag.querySelector('#prev-btn')?.addEventListener('click', async () => { state.page--; await loadCustomers(); });
  pag.querySelector('#next-btn')?.addEventListener('click', async () => { state.page++; await loadCustomers(); });
  pag.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', async () => { state.page = parseInt(btn.dataset.page); await loadCustomers(); });
  });
}

function showAddCustomerModal() {
  openCustomerFormModal({
    mode: 'add',
    onSaved: async () => {
      state.page = 1;
      await loadCustomers();
    },
  });
}

function exportCsv() {
  CustomersService.list({ pageSize: 9999, view: state.view }).then(result => {
    if (!result.success) return;
    const rows = [
      state.view === 'costs'
        ? ['Customer ID', 'Full Name', 'Phone', 'Email', 'City', 'Status', 'Outstanding', 'Purchase Cost', 'Cost Gap', 'Joined']
        : ['Customer ID', 'Full Name', 'Phone', 'Email', 'City', 'Status', 'Outstanding', 'Joined'],
      ...result.data.map(c => state.view === 'costs'
        ? [c.accountNumber || '', c.fullName, c.phone, c.email, c.city, c.status, c.totalOutstanding, c.totalPurchaseCost, c.totalCostGap, new Date(c.createdAt).toLocaleDateString()]
        : [c.accountNumber || '', c.fullName, c.phone, c.email, c.city, c.status, c.totalOutstanding, new Date(c.createdAt).toLocaleDateString()]
      ),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(url);
    Toast.success('Exported', 'Customer list downloaded as CSV.');
  });
}

function renderTableSkeleton(rows, cols) {
  return Array(rows).fill('').map(() =>
    `<tr>${Array(cols).fill('').map(() =>
      `<td><div class="skeleton skeleton-text"></div></td>`
    ).join('')}</tr>`
  ).join('');
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
