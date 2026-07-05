/**
 * dashboard.js — Admin dashboard with real-time KPI updates via EventBus
 *
 * KPI cards link to filtered list pages using query params:
 *   Active Plans    → #/installments?status=active
 *   Overdue         → #/installments?status=overdue
 *   Monthly Collect → #/payments?month=current
 *   Total Customers → #/customers?status=active
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import { formatCurrency, formatDate } from '../config.js';
import { BarChart } from '../components/chart.js';
import EventBus from '../components/event-bus.js';
import AuthService from '../services/auth.service.js';

let _unsubs = [];

export default async function init() {
  const user = AuthService.getUser();
  if (!user) { window.location.hash = '#/login'; return; }
  if (user.role === 'customer') { window.location.hash = '#/customer-dashboard'; return; }
  if (user.role === 'manager' || user.role === 'agent') {
    window.location.hash = '#/manager-dashboard';
    return;
  }

  renderNavbar('Dashboard', 'Business Overview');

  const content = document.getElementById('page-content');
  content.innerHTML = renderShell(user);

  await refreshAll();

  // Real-time: re-render on any data mutation
  _unsubs.forEach(u => u());
  _unsubs = [
    EventBus.on('payment:recorded',    refreshAll),
    EventBus.on('installment:created', refreshAll),
    EventBus.on('customer:created',    refreshAll),
  ];
}

// ── Shell HTML ────────────────────────────────────────────────────────────────
function renderShell(user) {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Dashboard</h1>
        <p>Real-time financial overview · ${user.name}</p>
      </div>
      <div class="page-header-actions">
        <a href="#/installments/create" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Plan
        </a>
        <a href="#/customers" class="btn btn-secondary">Add Customer</a>
      </div>
    </div>

    <!-- KPI Grid: skeleton while loading, replaced by refreshKPIs() -->
    <div class="kpi-grid" id="dash-kpi-grid">
      ${[1,2,3,4].map(() => `
        <div class="stat-card">
          <div class="skeleton" style="height:80px;border-radius:var(--radius-sm)"></div>
        </div>
      `).join('')}
    </div>

    <div class="content-grid">
      <!-- Left: Chart + Due list -->
      <div>
        <div class="card" style="margin-bottom:var(--space-6)">
          <div class="card-header">
            <h4>Monthly Collections (Last 6 Months)</h4>
            <a href="#/reports" class="btn btn-ghost btn-sm">Full Report →</a>
          </div>
          <div id="dash-bar-chart" style="min-height:220px"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <h4>Today's Due / Overdue</h4>
            <a href="#/installments?status=overdue" class="btn btn-ghost btn-sm">All Overdue →</a>
          </div>
          <div id="dash-due-list">
            <div class="skeleton" style="height:120px;border-radius:var(--radius-sm)"></div>
          </div>
        </div>
      </div>

      <!-- Right: Quick Actions + System -->
      <div style="display:flex;flex-direction:column;gap:var(--space-6)">
        <div class="card">
          <div class="card-header"><h4>Quick Actions</h4></div>
          <nav id="dash-quick-actions" style="display:flex;flex-direction:column;gap:var(--space-2)"></nav>
        </div>

        <div class="card">
          <div class="card-header"><h4>System</h4></div>
          <div style="display:flex;flex-direction:column;gap:var(--space-3)">
            <div class="info-row">
              <span class="info-label">Mode</span>
              <span class="badge badge-paid badge-nodot">Mock / Demo</span>
            </div>
            <div class="info-row">
              <span class="info-label">Logged in as</span>
              <span class="info-value">${user.name} (${user.role})</span>
            </div>
            <div class="info-row" style="border:none">
              <a href="#/audit-logs" class="btn btn-ghost btn-sm" style="margin-left:auto">Audit Log →</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Quick Actions (injected separately so they aren't re-created on refresh) ──
function renderQuickActions() {
  const nav = document.getElementById('dash-quick-actions');
  if (!nav || nav.children.length > 0) return; // already rendered

  const actions = [
    { label: 'New Customer',   icon: '👤', route: 'customers' },
    { label: 'Create Plan',    icon: '📋', route: 'installments/create' },
    { label: 'View Payments',  icon: '💳', route: 'payments' },
    { label: 'View Reports',   icon: '📈', route: 'reports' },
    { label: 'Analytics',      icon: '📉', route: 'analytics' },
    { label: 'Manage Staff',   icon: '👥', route: 'users' },
  ];

  actions.forEach(a => {
    const link = document.createElement('a');
    link.href = `#/${a.route}`;
    link.style.cssText = `
      display:flex;align-items:center;gap:12px;padding:11px 14px;
      border-radius:var(--radius-sm);border:1px solid var(--color-border);
      text-decoration:none;color:var(--color-text-secondary);
      transition:background 0.15s, border-color 0.15s;
    `;
    link.innerHTML = `
      <span style="font-size:20px;width:28px;text-align:center">${a.icon}</span>
      <span style="font-size:14px;font-weight:500;color:var(--color-text-primary);flex:1">${a.label}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    `;
    link.addEventListener('mouseenter', () => {
      link.style.background = 'var(--color-bg-hover)';
      link.style.borderColor = 'var(--color-border-strong)';
    });
    link.addEventListener('mouseleave', () => {
      link.style.background = '';
      link.style.borderColor = 'var(--color-border)';
    });
    nav.appendChild(link);
  });
}

// ── Refresh all data ──────────────────────────────────────────────────────────
async function refreshAll() {
  renderQuickActions();

  const [summaryRes, chartRes, dueRes] = await Promise.all([
    InstallmentsService.getSummary(),
    InstallmentsService.getCollectionsChart(6),
    InstallmentsService.getTodaysDue(),
  ]);

  refreshKPIs(summaryRes);
  refreshChart(chartRes);
  refreshDueList(dueRes);
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
function refreshKPIs(summaryRes) {
  const grid = document.getElementById('dash-kpi-grid');
  if (!grid) return;

  if (!summaryRes.success) {
    grid.innerHTML = `<div class="alert alert-danger" style="grid-column:1/-1">Failed to load summary data.</div>`;
    return;
  }

  const d = summaryRes.data;
  const kpis = [
    {
      label: 'Total Customers',
      value: d.totalCustomers,
      change: '+3 this month',
      changeDir: 'up',
      // Link to customers filtered to active
      link: '#/customers?status=active',
      color: 'var(--color-accent-blue)',
      bg: 'var(--color-accent-blue-dim)',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>`,
    },
    {
      label: 'Active Plans',
      value: d.activePlans,
      change: d.overdueCount > 0 ? `${d.overdueCount} overdue` : 'All on track',
      changeDir: d.overdueCount > 0 ? 'down' : 'up',
      // Link to installments filtered to active
      link: '#/installments?status=active',
      color: 'var(--color-accent-cyan)',
      bg: 'rgba(34,211,238,0.1)',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>`,
    },
    {
      label: 'This Month Collections',
      value: formatCurrency(d.monthlyCollection, true),
      change: 'Click to view payments',
      changeDir: 'up',
      // Link to payments filtered to current month
      link: '#/payments?month=current',
      color: 'var(--color-accent-green)',
      bg: 'var(--color-accent-green-dim)',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>`,
    },
    {
      label: 'Overdue Installments',
      value: d.overdueCount,
      change: d.overdueCount > 0 ? 'Needs attention' : 'All clear!',
      changeDir: d.overdueCount > 0 ? 'down' : 'up',
      // Link to installments filtered to overdue
      link: '#/installments?status=overdue',
      color: 'var(--color-accent-red)',
      bg: 'var(--color-accent-red-dim)',
      icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`,
    },
  ];

  // Render as plain anchor tags — no inline event handlers
  grid.innerHTML = kpis.map(k => `
    <a href="${k.link}" class="stat-card" style="text-decoration:none;display:block;cursor:pointer">
      <div class="stat-icon" style="background:${k.bg};color:${k.color}">${k.icon}</div>
      <div class="stat-value">${k.value}</div>
      <div class="stat-label">${k.label}</div>
      <div class="stat-change ${k.changeDir}">
        ${k.changeDir === 'up'
          ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`
          : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`}
        ${k.change}
      </div>
    </a>
  `).join('');
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────
function refreshChart(chartRes) {
  const el = document.getElementById('dash-bar-chart');
  if (!el) return;

  if (!chartRes.success || !chartRes.data?.length) {
    el.innerHTML = `<div class="empty-state" style="padding:40px"><p>No collections data yet.</p></div>`;
    return;
  }
  BarChart(el, chartRes.data, { height: 220 });
}

// ── Due Today Table ───────────────────────────────────────────────────────────
function refreshDueList(dueRes) {
  const el = document.getElementById('dash-due-list');
  if (!el) return;

  if (!dueRes.success || !dueRes.data?.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:32px">
        <span style="font-size:40px">✅</span>
        <h4>All clear!</h4>
        <p>No installments overdue or due today.</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="table-wrapper" style="border:none;border-radius:0">
      <table class="data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Amount Due</th>
            <th>Status</th>
            <th>Due Date</th>
            <th style="text-align:right">Action</th>
          </tr>
        </thead>
        <tbody>
          ${dueRes.data.map(s => `
            <tr style="cursor:pointer" onclick="window.location.hash='/installments/${s.planId}'">
              <td style="font-weight:500">${s.customerName}</td>
              <td style="font-family:var(--font-mono);font-weight:600">${formatCurrency(s.amountDue)}</td>
              <td><span class="badge badge-${s.status}">${s.status}</span></td>
              <td class="secondary">${formatDate(s.dueDate)}</td>
              <td style="text-align:right">
                <a href="#/installments/${s.planId}" class="btn btn-sm btn-ghost"
                   onclick="event.stopPropagation()">View →</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
