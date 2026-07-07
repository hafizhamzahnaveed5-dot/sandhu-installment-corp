/**
 * reports.js — System collections reports page
 * Contains simple collection sums, CSV exporters, and tabular schedules
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import { formatCurrency, formatDate } from '../config.js';
import Toast from '../components/toast.js';

export default async function init() {
  renderNavbar('Reports', 'Exportable statements and payment logs');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Financial Reports</h1>
        <p>Operational collections history log</p>
      </div>
      <div class="page-header-actions" style="display:flex;gap:12px;align-items:center">
        <a class="btn btn-secondary" href="#/reports?view=costs">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          Cost Ledger
        </a>
        <button class="btn btn-primary" id="export-collections-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export Collections CSV
        </button>
      </div>
    </div>

    <!-- Quick stats grid -->
    <div class="kpi-grid" id="reports-kpi-grid">
      <div class="stat-card">
        <div class="stat-value" id="rep-tot-payments">Loading...</div>
        <div class="stat-label">Total Volume Collected</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="rep-count-payments">Loading...</div>
        <div class="stat-label">Transactions Processed</div>
      </div>
    </div>

    <!-- Collection Ledger table -->
    <div class="card" style="padding:0;overflow:hidden">
      <div class="card-header" style="border:none;padding:20px 24px 0">
        <h4>Recent Collections Ledger</h4>
      </div>
      <div class="table-wrapper" style="border:none;border-radius:0">
        <table class="data-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Plan ID</th>
              <th>Amount Collected</th>
              <th>Method</th>
              <th>Received At</th>
            </tr>
          </thead>
          <tbody id="reports-tbody">
            <tr><td colspan="5"><div class="skeleton skeleton-text"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Fetch payments
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
  const view = urlParams.get('view') || 'transactions';

  if (view === 'costs') {
    await renderCostLedger();
    return;
  }

  const payRes = await InstallmentsService.listPayments();
  const payments = payRes.data || [];

  const totVol = payments.reduce((s, p) => s + p.amount, 0);

  document.getElementById('rep-tot-payments').textContent = formatCurrency(totVol);
  document.getElementById('rep-count-payments').textContent = payments.length;

  const tbody = document.getElementById('reports-tbody');
  if (payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>No transactions recorded</h3></div></td></tr>`;
  } else {
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td class="mono font-semibold">${p.receiptNumber}</td>
        <td class="mono">${p.planId}</td>
        <td style="font-weight:600;font-family:var(--font-mono);color:var(--color-accent-green)">${formatCurrency(p.amount)}</td>
        <td><span class="badge badge-info badge-nodot">${p.method.toUpperCase()}</span></td>
        <td class="secondary">${formatDate(p.paidAt)}</td>
      </tr>
    `).join('');
  }

  renderCostToggle(view);

  const exportBtn = document.getElementById('export-collections-btn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      if (payments.length === 0) {
        Toast.warning('Empty Report', 'No payment records to export.');
        return;
      }
      const headers = ['Receipt Number', 'Plan ID', 'Amount Collected', 'Payment Method', 'Date Paid'];
      const rows = payments.map(p => [p.receiptNumber, p.planId, p.amount, p.method, p.paidAt]);
      const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `collections_report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      Toast.success('Export Successful', 'Downloaded operational collections report.');
    };
  }
}

async function renderCostLedger() {
  document.getElementById('reports-kpi-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-value" id="rep-tot-payments">Loading...</div>
      <div class="stat-label">Total Purchase Cost</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="rep-count-payments">Loading...</div>
      <div class="stat-label">Total Cost Gap</div>
    </div>
  `;

  const [summaryRes, plansRes] = await Promise.all([
    InstallmentsService.getSummary(),
    InstallmentsService.listPlans({ pageSize: 999 })
  ]);

  const totalPurchaseCost = summaryRes.success ? formatCurrency(summaryRes.data.totalPurchaseCost) : '—';
  const totalCostGap = summaryRes.success ? formatCurrency(summaryRes.data.totalCostGap) : '—';

  document.getElementById('rep-tot-payments').textContent = totalPurchaseCost;
  document.getElementById('rep-count-payments').textContent = totalCostGap;

  const tbody = document.getElementById('reports-tbody');
  if (!summaryRes.success || !plansRes.success) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>Unable to load cost ledger</h3><p>${summaryRes.error || plansRes.error || 'Please try again.'}</p></div></td></tr>`;
    return;
  }

  const plans = plansRes.data || [];
  if (plans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>No plans to show costs for</h3></div></td></tr>`;
  } else {
    tbody.innerHTML = plans.map(p => `
      <tr>
        <td class="mono font-semibold">${p.id}</td>
        <td>${p.customerName || p.customerId}</td>
        <td>${formatCurrency(p.principalAmount)}</td>
        <td>${formatCurrency(p.purchaseCost)}</td>
        <td>${formatCurrency(p.costGap)}</td>
      </tr>
    `).join('');
  }

  const cardTitle = document.querySelector('.card-header h4');
  if (cardTitle) cardTitle.textContent = 'Cost Ledger';
  const tableHeader = document.querySelector('.data-table thead tr');
  if (tableHeader) {
    tableHeader.innerHTML = `
      <th>Plan ID</th>
      <th>Customer</th>
      <th>Invoice Price</th>
      <th>Purchase Cost</th>
      <th>Cost Gap</th>
    `;
  }

  const exportBtn = document.getElementById('export-collections-btn');
  if (exportBtn) {
    exportBtn.textContent = 'Export Cost Ledger CSV';
    exportBtn.onclick = async () => {
      const plansData = plansRes.data || [];
      if (!plansData.length) {
        Toast.warning('Empty Report', 'No cost records to export.');
        return;
      }
      const headers = ['Plan ID', 'Customer', 'Invoice Price', 'Purchase Cost', 'Cost Gap'];
      const rows = plansData.map(p => [p.id, p.customerName || p.customerId, p.principalAmount, p.purchaseCost, p.costGap]);
      const csvContent = [headers, ...rows]
        .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `cost_ledger_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      Toast.success('Export Successful', 'Downloaded cost ledger report.');
    };
  }
}

function renderCostToggle(view = 'transactions') {
  const btn = document.getElementById('export-collections-btn');
  if (!btn) return;
  btn.textContent = view === 'costs' ? 'Export Cost Ledger CSV' : 'Export Collections CSV';
}
