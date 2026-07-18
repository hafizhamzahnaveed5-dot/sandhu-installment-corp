/**
 * customer-dashboard.js — Customer self-service portal
 * A customer can ONLY see their own installment plan and payment schedule.
 * Data isolation: matches logged-in user's email to a customer record.
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import CustomersService from '../services/customers.service.js';
import AuthService from '../services/auth.service.js';
import { DonutChart } from '../components/chart.js';
import { formatCurrency, formatDate, Config } from '../config.js';
import { Icon } from '../components/icons.js';

export default async function init() {
  const user = AuthService.getUser();
  if (!user) { window.location.hash = '#/login'; return; }

  renderNavbar('My Plan', `Welcome, ${user.name}`);

  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="skeleton" style="height:400px;border-radius:var(--radius-md)"></div>`;

  // Find their customer record by matching email
  const custsRes = await CustomersService.list({ search: user.email || user.name });
  const customer = (custsRes.data || []).find(c =>
    c.email === user.email || c.fullName.toLowerCase() === user.name.toLowerCase()
  ) || custsRes.data?.[0];

  if (!customer) {
    content.innerHTML = `
      <div class="empty-state" style="padding:80px 24px">
        ${Icon('user', 56)}
        <h2>No account linked</h2>
        <p>Your customer profile hasn't been set up yet.<br>Please contact Sandhu Installment Corporation.</p>
        ${Config.BUSINESS?.PHONE ? `<a href="tel:${Config.BUSINESS.PHONE}" class="btn btn-primary mt-4" style="display:inline-flex;align-items:center;gap:8px">${Icon('phone', 16)} Contact Us</a>` : ''}
      </div>
    `;
    return;
  }

  // Load their plans and schedule
  const [plansRes] = await Promise.all([
    InstallmentsService.listPlans({ customerId: customer.id }),
  ]);

  const plans = plansRes.data || [];
  if (!plans.length) {
    content.innerHTML = `
      <div class="empty-state" style="padding:80px 24px">
        ${Icon('file-text', 56)}
        <h2>No active plans</h2>
        <p>You don't have any installment plans yet.</p>
      </div>
    `;
    return;
  }

  const plan = plans[0];
  const schedRes = await InstallmentsService.getSchedule(plan.id);
  const schedule = schedRes.data || [];

  const paidRows    = schedule.filter(s => s.status === 'paid');
  const paidAmount  = paidRows.reduce((sum, s) => sum + s.amountPaid, 0);
  const remaining   = plan.numberOfInstallments - paidRows.length;
  const progress    = Math.round((paidRows.length / plan.numberOfInstallments) * 100) || 0;
  const nextDue     = schedule.find(s => s.status !== 'paid');
  const isComplete  = remaining === 0;

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>My Installment Plan</h1>
        <p>Plan #${plan.id} · ${plan.productName || 'Purchase'}</p>
      </div>
    </div>

    <!-- Summary card -->
    <div class="card" style="margin-bottom:var(--space-6)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-6)">
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">
            Total Plan Value
          </div>
          <div style="font-size:36px;font-weight:700;font-family:var(--font-mono)">
            ${formatCurrency(plan.principalAmount)}
          </div>
          <div style="font-size:13px;color:var(--color-text-secondary);margin-top:8px">
            ${plan.numberOfInstallments} × ${formatCurrency(plan.installmentAmount)} / ${plan.frequency}
          </div>
        </div>
        <div id="cust-donut"></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-4);
                  margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--color-border)">
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--color-accent-green)">${formatCurrency(paidAmount)}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px">Total Paid</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--color-accent-amber)">${remaining}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px">Installments Left</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:700;color:${isComplete ? 'var(--color-accent-green)' : nextDue ? 'var(--color-accent-red)' : 'var(--color-accent-blue)'}">
            ${isComplete ? '✓ Done' : nextDue ? formatDate(nextDue.dueDate) : '—'}
          </div>
          <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px">Next Due</div>
        </div>
      </div>
    </div>

    <!-- Status alert -->
    ${isComplete
      ? `<div class="alert alert-success" style="margin-bottom:var(--space-6)">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
           <div><strong>Plan Complete!</strong> All installments have been paid. Thank you for your business!</div>
         </div>`
      : nextDue
      ? `<div class="alert alert-warning" style="margin-bottom:var(--space-6)">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           <div>
             <strong>Next payment due: ${formatDate(nextDue.dueDate)}</strong><br>
             Amount: <strong>${formatCurrency(nextDue.amountDue)}</strong>
             ${Config.BUSINESS?.PHONE ? `— Visit our office or call <a href="tel:${Config.BUSINESS.PHONE}" style="color:inherit;text-decoration:underline">${Config.BUSINESS.PHONE}</a>` : '— Visit our office to make the payment.'}
           </div>
         </div>`
      : ''
    }

    <!-- Schedule table -->
    <div class="card" style="padding:0">
      <div class="card-header" style="border:none;padding:20px 24px">
        <h4>Payment Schedule</h4>
        <span class="badge badge-info badge-nodot">${progress}% Complete</span>
      </div>
      <div class="table-wrapper" style="border:none;border-radius:0">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Due Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Paid On</th>
            </tr>
          </thead>
          <tbody>
            ${schedule.map(s => `
              <tr>
                <td class="mono">${s.installmentNumber}</td>
                <td class="secondary">${formatDate(s.dueDate)}</td>
                <td style="font-weight:600;font-family:var(--font-mono)">${formatCurrency(s.amountDue)}</td>
                <td><span class="badge badge-${s.status}">${s.status.charAt(0).toUpperCase() + s.status.slice(1)}</span></td>
                <td class="secondary">${s.paidDate ? formatDate(s.paidDate) : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Render donut chart
  const donutEl = document.getElementById('cust-donut');
  if (donutEl) {
    DonutChart(
      donutEl,
      progress,
      isComplete ? 'var(--color-accent-green)' : 'var(--color-accent-blue)'
    );
  }
}
