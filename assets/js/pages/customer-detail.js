/**
 * customer-detail.js — Customer detail page
 * Shows profile, ledger, installment plans, documents, activity timeline
 */

import { renderNavbar } from '../components/navbar.js';
import CustomersService from '../services/customers.service.js';
import InstallmentsService from '../services/installments.service.js';
import { openCustomerFormModal } from '../components/customer-form-modal.js';
import { formatDate, formatCurrency, getInitials } from '../config.js';

export default async function init({ param }) {
  const customerId = param;

  renderNavbar('Customer Detail', 'Loading...');

  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="skeleton" style="height:400px;border-radius:var(--radius-md)"></div>`;

  const [custRes, plansRes] = await Promise.all([
    CustomersService.getById(customerId),
    InstallmentsService.listPlans({ customerId }),
  ]);

  if (!custRes.success) {
    content.innerHTML = `<div class="empty-state"><h3>Customer not found</h3><a href="#/customers" class="btn btn-primary mt-4">Back to Customers</a></div>`;
    return;
  }

  const c = custRes.data;
  const plans = plansRes.data || [];

  renderNavbar('Customer Detail', c.fullName);

  // Calculate ledger stats
  const activePlans = plans.filter(p => p.status === 'active').length;
  
  const totalExpectedMarkup = plans.reduce((s, p) => s + (p.markupAmount || 0), 0);
  const totalEarnedMarkup = plans.reduce((s, p) => s + (p.markupEarned || 0), 0);

  const statusBadge = `<span class="badge badge-${c.status}">${capitalize(c.status)}</span>`;

  content.innerHTML = `
    <!-- Breadcrumb -->
    <div class="breadcrumb" style="margin-bottom:var(--space-5)">
      <a href="#/customers">Customers</a>
      <span class="sep">/</span>
      <span class="current">${c.fullName}</span>
    </div>

    <!-- Header Card -->
    <div class="card" style="margin-bottom:var(--space-6)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:var(--space-5)">
          <div class="avatar avatar-xl" style="font-size:28px;background:var(--color-accent-blue-dim);color:var(--color-accent-blue)">
            ${getInitials(c.fullName)}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
              <h2 style="margin:0">${c.fullName}</h2>
              ${statusBadge}
              ${c.status === 'blacklisted' ? `<span class="badge badge-danger">⚠️ Blacklisted</span>` : ''}
            </div>
            <div style="margin-bottom:8px">
              <span style="font-size:12px;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:.06em;font-weight:600">Customer ID</span>
              <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--color-accent-blue)">
                ${c.accountNumber || '<span style="color:var(--color-accent-amber)">Not set — click Edit</span>'}
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:var(--space-4);font-size:13px;color:var(--color-text-secondary)">
              <span>📱 ${c.phone}</span>
              ${c.email ? `<span>✉️ ${c.email}</span>` : ''}
              <span>📍 ${c.city}${c.address ? ', ' + c.address : ''}</span>
              <span>📅 Joined ${formatDate(c.createdAt)}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-3)">
          <a href="#/installments/create?customerId=${c.id}" class="btn btn-primary btn-sm">+ New Plan</a>
          <button class="btn btn-secondary btn-sm" id="edit-customer-btn">Edit</button>
        </div>
      </div>

      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-4);margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--color-border)">
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--color-accent-blue)">${formatCurrency(c.totalOutstanding)}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Outstanding</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--color-accent-purple)">${formatCurrency(totalEarnedMarkup)}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Earned Profit</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--color-text-primary)">${plans.length}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Total Plans</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--color-accent-green)">${activePlans}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Active Plans</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--color-text-primary)">${c.creditScore || '—'}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Credit Score</div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn active" data-tab="plans">Installment Plans (${plans.length})</button>
      <button class="tab-btn" data-tab="info">Personal Info</button>
      <button class="tab-btn" data-tab="documents">Documents (${c.documents?.length || 0})</button>
      <button class="tab-btn" data-tab="timeline">Activity Timeline</button>
    </div>

    <!-- Plans tab -->
    <div class="tab-content active" id="tab-plans">
      ${plans.length === 0 ? `
        <div class="empty-state">
          <span style="font-size:40px">📋</span>
          <h3>No installment plans</h3>
          <p>This customer has no plans yet.</p>
          <a href="#/installments/create?customerId=${c.id}" class="btn btn-primary mt-4">Create First Plan</a>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:var(--space-4)">
          ${plans.map(plan => renderPlanCard(plan)).join('')}
        </div>
      `}
    </div>

    <!-- Personal Info tab -->
    <div class="tab-content" id="tab-info">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6)">
        <div class="card">
          <h4 style="margin-bottom:16px">Contact Information</h4>
          <div class="info-row"><span class="info-label">Customer ID</span><span class="info-value mono" style="font-weight:700;color:var(--color-accent-blue)">${c.accountNumber || '—'}</span></div>
          <div class="info-row"><span class="info-label">Full Name</span><span class="info-value">${c.fullName}</span></div>
          <div class="info-row"><span class="info-label">Phone</span><span class="info-value mono">${c.phone}</span></div>
          <div class="info-row"><span class="info-label">SMS Alerts</span><span class="info-value"><span class="badge ${c.smsAlertsEnabled === false ? 'badge-inactive' : 'badge-paid'} badge-nodot">${c.smsAlertsEnabled === false ? 'Disabled' : 'Enabled'}</span></span></div>
          <div class="info-row"><span class="info-label">Email</span><span class="info-value">${c.email || '—'}</span></div>
          <div class="info-row"><span class="info-label">CNIC / ID</span><span class="info-value mono">••••-•••••••-•</span></div>
          <div class="info-row"><span class="info-label">Address</span><span class="info-value" style="text-align:right">${c.address || '—'}</span></div>
          <div class="info-row"><span class="info-label">City</span><span class="info-value">${c.city}</span></div>
        </div>
        <div class="card">
          <h4 style="margin-bottom:16px">Guarantor Information</h4>
          <div class="info-row"><span class="info-label">Guarantor Name</span><span class="info-value">${c.guarantorName || '—'}</span></div>
          <div class="info-row"><span class="info-label">Guarantor Phone</span><span class="info-value mono">${c.guarantorPhone || '—'}</span></div>
          ${c.notes ? `
          <div style="margin-top:16px;padding:12px;background:var(--color-bg-secondary);border-radius:var(--radius-sm);font-size:13px;color:var(--color-text-secondary)">
            <strong>Notes:</strong> ${c.notes}
          </div>` : ''}
        </div>
      </div>
    </div>

    <!-- Documents tab -->
    <div class="tab-content" id="tab-documents">
      ${c.documents?.length === 0 ? `
        <div class="empty-state">
          <span style="font-size:40px">📄</span>
          <h3>No documents uploaded</h3>
          <p>CNIC copies, salary slips, and other documents will appear here.</p>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:var(--space-4)">
          ${c.documents.map(doc => `
            <div class="card" style="text-align:center;padding:var(--space-5)">
              <div style="font-size:40px;margin-bottom:12px">📄</div>
              <div style="font-size:14px;font-weight:500">${doc.name}</div>
              <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px">${formatDate(doc.uploadedAt)}</div>
              <a href="${doc.url}" class="btn btn-ghost btn-sm" style="margin-top:12px" target="_blank">View</a>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Timeline tab -->
    <div class="tab-content" id="tab-timeline">
      <div class="timeline">
        <div class="timeline-item">
          <div class="timeline-dot" style="background:var(--color-accent-blue-dim);border-color:var(--color-accent-blue-dim)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-blue)" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div class="timeline-content">
            <div class="timeline-title">Customer registered</div>
            <div class="timeline-time">${formatDate(c.createdAt)}</div>
            <div class="timeline-body">Account created in the system.</div>
          </div>
        </div>
        ${plans.map(plan => `
          <div class="timeline-item">
            <div class="timeline-dot" style="background:var(--color-accent-cyan-dim);border-color:var(--color-accent-cyan-dim)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-cyan)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div class="timeline-content">
              <div class="timeline-title">Installment plan created — ${formatCurrency(plan.principalAmount)}</div>
              <div class="timeline-time">${formatDate(plan.createdAt)}</div>
              <div class="timeline-body">${plan.numberOfInstallments} installments × ${formatCurrency(plan.installmentAmount)}/month · Status: <span class="badge badge-${plan.status} badge-nodot" style="display:inline">${capitalize(plan.status)}</span></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  document.getElementById('edit-customer-btn')?.addEventListener('click', () => {
    openCustomerFormModal({
      mode: 'edit',
      customer: c,
      onSaved: async () => init({ param: customerId }),
      onDeleted: async () => {
        window.location.hash = '/customers';
      },
    });
  });
}

function renderPlanCard(plan) {
  const paidCount = 0; // Would need schedule data for exact count
  const percent = Math.round((paidCount / plan.numberOfInstallments) * 100);
  const progressFill = percent;

  return `
    <div class="card" style="cursor:pointer" onclick="window.location.hash='/installments/${plan.id}'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-family:var(--font-mono);font-size:12px;color:var(--color-text-tertiary)">#${plan.id}</span>
            <span class="badge badge-${plan.status}">${capitalize(plan.status)}</span>
          </div>
          <div style="font-size:24px;font-weight:700;color:var(--color-text-primary)">${formatCurrency(plan.principalAmount)} <span style="font-size:14px;font-weight:500;color:var(--color-text-tertiary)">+ ${formatCurrency(plan.markupAmount)} markup</span></div>
          <div style="font-size:13px;color:var(--color-text-secondary);margin-top:4px">
            Purchase Cost: ${formatCurrency(plan.purchaseCost)} • Cost Gap: ${formatCurrency(plan.costGap)}
          </div>
          <div style="font-size:13px;color:var(--color-text-secondary);margin-top:4px">
            ${plan.numberOfInstallments} × ${formatCurrency(plan.installmentAmount + (plan.markupAmount / plan.numberOfInstallments))} / ${plan.frequency}
            &nbsp;·&nbsp; Started ${formatDate(plan.startDate)}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;color:var(--color-text-tertiary)">Down Payment</div>
          <div style="font-size:16px;font-weight:600">${formatCurrency(plan.downPayment)}</div>
        </div>
      </div>
      <div style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-tertiary);margin-bottom:6px">
          <span>Payment progress</span>
          <span>${progressFill}% paid</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progressFill}%"></div></div>
      </div>
    </div>
  `;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ') : '';
}
