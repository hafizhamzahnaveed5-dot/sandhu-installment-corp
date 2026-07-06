/**
 * payments.js — Payment transactions history with search and month pre-filter
 * Supports ?month=current query param from dashboard "This Month's Collection" card
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import { formatCurrency, formatDate, debounce } from '../config.js';
import { attachSearch } from '../components/search.js';

let _allPayments = [];
let _searchHandle = null;

export default async function init() {
  renderNavbar('Payments History', 'View transaction ledger entries');

  // Read query param — ?month=current → filter to this calendar month
  const hashPart = window.location.hash || '';
  const qpStr = hashPart.includes('?') ? hashPart.split('?')[1] : '';
  const qp = new URLSearchParams(qpStr);
  const filterMonth = qp.get('month') || '';

  const content = document.getElementById('page-content');

  const now = new Date();
  const monthLabel = filterMonth === 'current'
    ? now.toLocaleString('en-PK', { month: 'long', year: 'numeric' })
    : '';

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Payment Ledger</h1>
        <p>${filterMonth === 'current' ? `Showing payments for ${monthLabel}` : 'All incoming installment collections'}</p>
      </div>
      <div class="page-header-actions">
        ${filterMonth ? `<a href="#/payments" class="btn btn-secondary">Clear Filter</a>` : ''}
      </div>
    </div>

    <!-- Search bar -->
    <div class="filter-bar" style="margin-bottom:var(--space-4)">
      <div class="search-input" style="flex:1;max-width:360px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="payments-search" type="text" placeholder="Search by receipt #, plan ID, or method…">
      </div>
      ${filterMonth === 'current' ? `
        <div class="badge badge-info badge-nodot" style="padding:8px 14px;font-size:13px">
          📅 ${monthLabel}
        </div>
      ` : ''}
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrapper" style="border:none;border-radius:0">
        <table class="data-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Plan ID</th>
              <th>Amount</th>
              <th>Method</th>
              <th>SMS</th>
              <th>Paid At</th>
              <th style="text-align:right">Action</th>
            </tr>
          </thead>
          <tbody id="payments-tbody">
            <tr><td colspan="7"><div class="skeleton skeleton-text" style="height:120px"></div></td></tr>
          </tbody>
        </table>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--color-border);font-size:13px;color:var(--color-text-tertiary)" id="payments-footer">
        Loading…
      </div>
    </div>
  `;

  // Load all payments
  const paymentsRes = await InstallmentsService.listPayments();
  let payments = paymentsRes.data || [];

  // Apply month filter
  if (filterMonth === 'current') {
    const y = now.getFullYear();
    const m = now.getMonth();
    payments = payments.filter(p => {
      const d = new Date(p.paidAt);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }

  _allPayments = payments;
  renderTable(payments);

  // Wire live search
  if (_searchHandle) _searchHandle.destroy();
  _searchHandle = attachSearch(
    'payments-search',
    _allPayments,
    ['receiptNumber', 'planId', 'method'],
    renderTable
  );
}

function renderTable(payments) {
  const tbody = document.getElementById('payments-tbody');
  const footer = document.getElementById('payments-footer');
  if (!tbody) return;

  if (!payments.length) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state" style="padding:48px">
          <span style="font-size:48px">💳</span>
          <h3>No transactions found</h3>
          <p>No payments match your current filter.</p>
        </div>
      </td></tr>
    `;
    if (footer) footer.textContent = '0 transactions';
    return;
  }

  const total = payments.reduce((sum, p) => sum + p.amount, 0);

  tbody.innerHTML = payments.map(p => `
    <tr style="cursor:pointer" onclick="window.location.hash='/payments/${p.id}'">
      <td class="mono" style="font-weight:600">${p.receiptNumber}</td>
      <td class="mono">${p.planId}</td>
      <td style="font-weight:700;color:var(--color-accent-green);font-family:var(--font-mono)">${formatCurrency(p.amount)}</td>
      <td><span class="badge badge-info badge-nodot">${p.method.toUpperCase()}</span></td>
      <td>${renderSmsBadge(p.smsStatus)}</td>
      <td class="secondary">${formatDate(p.paidAt)}</td>
      <td style="text-align:right">
        <a href="#/payments/${p.id}" class="btn btn-sm btn-ghost" onclick="event.stopPropagation()">
          View Receipt →
        </a>
      </td>
    </tr>
  `).join('');

  if (footer) {
    footer.innerHTML = `${payments.length} transaction${payments.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Total: <strong>${formatCurrency(total)}</strong>`;
  }
}

function renderSmsBadge(status) {
  if (status === 'sent') return '<span class="badge badge-paid badge-nodot">SMS sent</span>';
  if (status === 'failed') return '<span class="badge badge-danger badge-nodot">SMS failed</span>';
  if (status === 'skipped') return '<span class="badge badge-inactive badge-nodot">SMS off</span>';
  return '<span class="badge badge-inactive badge-nodot">Pending</span>';
}
