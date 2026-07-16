/**
 * manager-dashboard.js — Manager/Agent scoped operational dashboard
 * Shows: collections, active plans, overdue alerts, today's tasks.
 * No user management, no audit logs, no system-wide admin data.
 * Subscribes to EventBus for real-time updates.
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import { formatCurrency, formatDate } from '../config.js';
import { LineChart } from '../components/chart.js';
import EventBus from '../components/event-bus.js';
import AuthService from '../services/auth.service.js';

let _unsub = null;

export default async function init() {
  const user = AuthService.getUser();
  if (!user) { window.location.hash = '#/login'; return; }

  renderNavbar('Operational Dashboard', `Welcome, ${user.name}`);

  const content = document.getElementById('page-content');
  content.innerHTML = renderShell(user);

  await refreshAll();

  if (_unsub) _unsub();
  const u1 = EventBus.on('payment:recorded', refreshAll);
  const u2 = EventBus.on('installment:created', refreshAll);
  _unsub = () => { u1(); u2(); };
}

function renderShell(user) {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Operational Dashboard</h1>
        <p>Daily collection tasks for ${user.name}</p>
      </div>
      <div class="page-header-actions">
        <a href="#/installments/create" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Plan
        </a>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid" id="mgr-kpi-grid">
      ${[1,2,3].map(() => `
        <div class="stat-card">
          <div class="skeleton" style="height:80px;border-radius:var(--radius-sm)"></div>
        </div>
      `).join('')}
    </div>

    <!-- Main grid -->
    <div class="content-grid">
      <div>
        <!-- Collections chart -->
        <div class="card" style="margin-bottom:var(--space-6)">
          <div class="card-header">
            <h4>Monthly Collections</h4>
            <a href="#/reports" class="btn btn-ghost btn-sm">Full Report →</a>
          </div>
          <div id="mgr-line-chart" style="min-height:200px"></div>
        </div>

        <!-- Today's due -->
        <div class="card">
          <div class="card-header">
            <h4>Today's Due Installments</h4>
            <a href="#/installments" class="btn btn-ghost btn-sm">All Plans →</a>
          </div>
          <div id="mgr-due-list">
            <div class="skeleton" style="height:150px;border-radius:var(--radius-sm)"></div>
          </div>
        </div>
      </div>

      <!-- Sidebar: Quick Actions -->
      <div>
        <div class="card">
          <div class="card-header"><h4>Quick Actions</h4></div>
          <div style="display:flex;flex-direction:column;gap:var(--space-2)">
            ${[
              { label: 'Add Customer',   icon: '👤', route: 'customers' },
              { label: 'Create Plan',    icon: '📋', route: 'installments/create' },
              { label: 'View Payments',  icon: '💳', route: 'payments' },
              { label: 'Roznamcha',      icon: '📒', route: 'roznamcha' },
              { label: 'Reports',        icon: '📊', route: 'reports' },
            ].map(a => `
              <a href="#/${a.route}"
                style="display:flex;align-items:center;gap:12px;padding:11px 14px;
                       border-radius:var(--radius-sm);border:1px solid var(--color-border);
                       text-decoration:none;color:var(--color-text-secondary);transition:all var(--transition-fast)"
                onmouseenter="this.style.background='var(--color-bg-hover)'"
                onmouseleave="this.style.background=''">
                <span style="font-size:20px;width:28px;text-align:center">${a.icon}</span>
                <span style="font-size:14px;font-weight:500;color:var(--color-text-primary);flex:1">${a.label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function refreshAll() {
  const [summaryRes, chartRes, dueRes] = await Promise.all([
    InstallmentsService.getSummary(),
    InstallmentsService.getCollectionsChart(6),
    InstallmentsService.getTodaysDue(),
  ]);

  // KPI cards
  if (summaryRes.success) {
    const d = summaryRes.data;
    const grid = document.getElementById('mgr-kpi-grid');
    if (grid) grid.innerHTML = [
      { label: 'Monthly Collections', value: formatCurrency(d.monthlyCollection, true), icon: '💰', color: 'var(--color-accent-green)', bg: 'var(--color-accent-green-dim)', link: '#/payments' },
      { label: 'Active Plans', value: d.activePlans, icon: '📋', color: 'var(--color-accent-blue)', bg: 'var(--color-accent-blue-dim)', link: '#/installments' },
      { label: 'Total Purchase Cost', value: formatCurrency(d.totalPurchaseCost, true), icon: '📦', color: 'var(--color-accent-yellow)', bg: 'rgba(255,198,0,0.12)', link: '#/customers?view=costs' },
      { label: 'Total Cost Gap', value: formatCurrency(d.totalCostGap, true), icon: '📈', color: 'var(--color-accent-orange)', bg: 'rgba(255,148,0,0.12)', link: '#/customers?view=costs' },
      { label: 'Overdue Alerts', value: d.overdueCount, icon: '⚠️', color: 'var(--color-accent-red)', bg: 'var(--color-accent-red-dim)', link: '#/installments' },
    ].map(k => `
      <a href="${k.link}" class="stat-card" style="text-decoration:none;--accent-color:${k.color}">
        <div class="stat-icon" style="background:${k.bg};color:${k.color}">
          <span style="font-size:20px">${k.icon}</span>
        </div>
        <div class="stat-value">${k.value}</div>
        <div class="stat-label">${k.label}</div>
      </a>
    `).join('');
  }

  // Chart
  if (chartRes.success && chartRes.data?.length) {
    const el = document.getElementById('mgr-line-chart');
    if (el) LineChart(el, chartRes.data, { height: 200 });
  }

  // Due list
  const el = document.getElementById('mgr-due-list');
  if (!el) return;

  if (!dueRes.success || !dueRes.data?.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:32px">
        <span style="font-size:36px">✅</span>
        <h4>All clear!</h4>
        <p>No installments due today.</p>
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
            <th>Phone</th>
            <th>Total Overdue</th>
            <th>Overdue Count</th>
            <th>Status</th>
            <th>Oldest Due</th>
            <th style="text-align:right">Action</th>
          </tr>
        </thead>
        <tbody>
          ${dueRes.data.map((item) => `
            <tr style="cursor:pointer" onclick="window.location.hash='/customers/${item.customerId}'">
              <td style="font-weight:500">${item.customerName}</td>
              <td class="secondary">${item.customerPhone || '—'}</td>
              <td style="font-family:var(--font-mono);font-weight:600">${formatCurrency(item.totalOverdueAmount)}</td>
              <td><span class="badge badge-danger">${item.overdueCount} overdue</span></td>
              <td><span class="badge badge-overdue">overdue</span></td>
              <td class="secondary">${formatDate(item.oldestDueDate)}</td>
              <td style="text-align:right">
                <a href="#/customers/${item.customerId}" class="btn btn-ghost btn-sm" onclick="event.stopPropagation()">View →</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
