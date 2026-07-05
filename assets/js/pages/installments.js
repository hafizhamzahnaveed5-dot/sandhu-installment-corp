/**
 * installments.js — Installment plans list page
 * Supports pre-filtering via URL query params: #/installments?status=overdue
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import Toast from '../components/toast.js';
import { formatDate, formatCurrency, capitalize, Config } from '../config.js';

let state = {
  page: 1,
  status: '',
  total: 0,
  totalPages: 1,
};

export default async function init() {
  renderNavbar('Installment Plans', 'Monitor and manage purchase installment plans');

  // Read query param for pre-filtering from dashboard card links
  // e.g. #/installments?status=overdue  →  pre-selects the Overdue chip
  const hashPart = window.location.hash || '';
  const qpStr = hashPart.includes('?') ? hashPart.split('?')[1] : '';
  const qp = new URLSearchParams(qpStr);
  const preStatus = qp.get('status') || '';
  state.status = preStatus;
  state.page = 1;

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Installment Plans</h1>
        <p id="plans-count">Loading plans...</p>
      </div>
      <div class="page-header-actions">
        <a href="#/installments/create" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create Plan
        </a>
      </div>
    </div>

    <!-- Filters — active class applied based on pre-selected status -->
    <div class="filter-bar">
      <div class="flex gap-2">
        <button class="filter-chip ${!preStatus ? 'active' : ''}" data-status="">All Plans</button>
        <button class="filter-chip ${preStatus === 'active'    ? 'active' : ''}" data-status="active">Active</button>
        <button class="filter-chip ${preStatus === 'overdue'   ? 'active' : ''}" data-status="overdue">Overdue</button>
        <button class="filter-chip ${preStatus === 'completed' ? 'active' : ''}" data-status="completed">Completed</button>
        <button class="filter-chip ${preStatus === 'defaulted' ? 'active' : ''}" data-status="defaulted">Defaulted</button>
      </div>
    </div>

    <!-- Table Card -->
    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrapper" style="border:none;border-radius:0">
        <table class="data-table" id="plans-table">
          <thead>
            <tr>
              <th>Plan ID</th>
              <th>Customer</th>
              <th>Principal</th>
              <th>Inst. Amount</th>
              <th>Frequency</th>
              <th>Status</th>
              <th>Start Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="plans-tbody">
            ${renderTableSkeleton(8, 8)}
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

  // Status Filter chips
  document.querySelectorAll('.filter-chip[data-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.filter-chip[data-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.status = btn.dataset.status;
      state.page = 1;
      await loadPlans();
    });
  });

  await loadPlans();
}

async function loadPlans() {
  const result = await InstallmentsService.listPlans({
    status: state.status,
    page: state.page,
    pageSize: Config.DEFAULT_PAGE_SIZE,
  });

  if (!result.success) {
    Toast.error('Load failed', result.error);
    return;
  }

  state.total = result.pagination.total;
  state.totalPages = result.pagination.totalPages;

  const countEl = document.getElementById('plans-count');
  if (countEl) {
    countEl.textContent = state.status
      ? `${state.total} ${state.status} plan${state.total !== 1 ? 's' : ''}`
      : `${state.total} plan${state.total !== 1 ? 's' : ''} total`;
  }

  renderTable(result.data);
  renderPagination();
}

function renderTable(plans) {
  const tbody = document.getElementById('plans-tbody');
  if (!tbody) return;

  if (plans.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <span style="font-size:40px">📋</span>
          <h3>No plans found</h3>
          <p>${state.status ? `No ${state.status} installment plans found.` : 'No installment plans yet.'}</p>
          <a href="#/installments/create" class="btn btn-primary mt-4">Create First Plan</a>
        </div>
      </td></tr>
    `;
    return;
  }

  tbody.innerHTML = plans.map(p => `
    <tr style="cursor:pointer" onclick="window.location.hash='/installments/${p.id}'">
      <td class="mono" style="font-weight:600">${p.id}</td>
      <td>
        <div style="font-weight:500">${p.customerName}</div>
      </td>
      <td style="font-weight:600;font-family:var(--font-mono)">${formatCurrency(p.principalAmount)}</td>
      <td style="font-family:var(--font-mono)">${formatCurrency(p.installmentAmount)}</td>
      <td class="secondary">${capitalize(p.frequency)}</td>
      <td><span class="badge badge-${p.status}">${capitalize(p.status)}</span></td>
      <td class="secondary">${formatDate(p.startDate)}</td>
      <td>
        <a href="#/installments/${p.id}" class="btn btn-ghost btn-icon btn-sm" onclick="event.stopPropagation()" title="View Plan">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </td>
    </tr>
  `).join('');
}

function renderPagination() {
  const info = document.getElementById('pagination-info');
  const pag = document.getElementById('pagination');
  if (!info || !pag) return;

  const start = (state.page - 1) * Config.DEFAULT_PAGE_SIZE + 1;
  const end = Math.min(state.page * Config.DEFAULT_PAGE_SIZE, state.total);
  info.textContent = state.total > 0 ? `Showing ${start}–${end} of ${state.total}` : 'No results';

  if (state.totalPages <= 1) { pag.innerHTML = ''; return; }

  pag.innerHTML = `
    <button class="page-btn" id="prev-btn" ${state.page <= 1 ? 'disabled' : ''}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button class="page-btn active">${state.page}</button>
    <button class="page-btn" id="next-btn" ${state.page >= state.totalPages ? 'disabled' : ''}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  `;

  pag.querySelector('#prev-btn')?.addEventListener('click', async () => { state.page--; await loadPlans(); });
  pag.querySelector('#next-btn')?.addEventListener('click', async () => { state.page++; await loadPlans(); });
}

function renderTableSkeleton(rows, cols) {
  return Array(rows).fill('').map(() =>
    `<tr>${Array(cols).fill('').map(() =>
      `<td><div class="skeleton skeleton-text"></div></td>`
    ).join('')}</tr>`
  ).join('');
}
