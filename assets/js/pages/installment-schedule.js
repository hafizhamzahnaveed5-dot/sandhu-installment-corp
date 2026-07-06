/**
 * installment-schedule.js — Visual installment schedule/timeline per plan
 * Includes "Settle Remaining Balance" one-click early-settlement action.
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import AuthService from '../services/auth.service.js';
import Toast from '../components/toast.js';
import Modal from '../components/modal.js';
import { DonutChart } from '../components/chart.js';
import { formatDate, formatCurrency, capitalize } from '../config.js';

export default async function init({ param }) {
  const planId = param;
  renderNavbar('Installment Details', `Plan #${planId}`);

  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="skeleton" style="height:400px;border-radius:var(--radius-md)"></div>`;

  const [planRes, schedRes] = await Promise.all([
    InstallmentsService.getPlanById(planId),
    InstallmentsService.getSchedule(planId),
  ]);

  if (!planRes.success) {
    content.innerHTML = `<div class="empty-state"><h3>Installment Plan not found</h3><a href="#/installments" class="btn btn-primary mt-4">Back</a></div>`;
    return;
  }

  const plan   = planRes.data;
  const schedule = schedRes.data || [];

  const paidRows      = schedule.filter(s => s.status === 'paid');
  const settledRows   = schedule.filter(s => s.status === 'settled');
  const paidAmount    = schedule.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
  const progressDone  = paidRows.length + settledRows.length;
  const progressPct   = Math.round((progressDone / plan.numberOfInstallments) * 100) || 0;

  // Remaining totals — use live outstanding_balance from plan if available
  const remainingDisplay = plan.outstandingBalance > 0
    ? plan.outstandingBalance
    : schedule.filter(s => s.status !== 'paid' && s.status !== 'settled')
        .reduce((sum, s) => sum + Math.max(0, s.amountDue - s.amountPaid), 0);

  // Can the current user initiate a settlement? (manager+)
  const canSettle = AuthService.hasRole('manager') && (plan.status === 'active' || plan.status === 'overdue');

  // Early-settlement banner (already settled)
  const earlyBanner = plan.settledEarlyAt ? `
    <div style="
      margin-bottom:var(--space-5);
      padding:14px 20px;
      border-radius:var(--radius-md);
      background:linear-gradient(135deg,rgba(var(--color-accent-green-rgb,34,197,94),.12),rgba(var(--color-accent-green-rgb,34,197,94),.04));
      border:1px solid rgba(34,197,94,.3);
      display:flex;align-items:center;gap:12px">
      <span style="font-size:22px">✨</span>
      <div>
        <div style="font-weight:700;color:var(--color-accent-green)">Plan Settled Early</div>
        <div style="font-size:13px;color:var(--color-text-secondary)">
          Settled on ${formatDate(plan.settledEarlyAt)} ·
          Markup waived: <strong>${formatCurrency(plan.markupWaived)}</strong>
        </div>
      </div>
    </div>` : '';

  content.innerHTML = `
    ${earlyBanner}

    <div class="breadcrumb" style="margin-bottom:var(--space-5)">
      <a href="#/installments">Installment Plans</a>
      <span class="sep">/</span>
      <span class="current">Plan #${planId}</span>
    </div>

    <!-- Header Panel -->
    <div class="card" style="margin-bottom:var(--space-6)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-4);flex-wrap:wrap">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:13px;color:var(--color-text-secondary);font-weight:600">PLAN #${plan.id}</span>
            <span class="badge badge-${plan.status}">${capitalize(plan.status)}</span>
          </div>
          <h2>Customer: <a href="#/customers/${plan.customerId}" style="color:inherit">${plan.customerName}</a></h2>
          <div style="font-size:13px;color:var(--color-text-secondary);margin-top:6px">
            Total Markup: ${formatCurrency(plan.markupAmount)} &nbsp;·&nbsp;
            Frequency: ${capitalize(plan.frequency)} &nbsp;·&nbsp;
            Start Date: ${formatDate(plan.startDate)}
          </div>
        </div>

        <!-- Donut Progress -->
        <div style="display:flex;align-items:center;gap:16px">
          <div id="donut-progress-container"></div>
          <div>
            <div style="font-size:12px;color:var(--color-text-tertiary)">Installments Done</div>
            <div style="font-size:18px;font-weight:700">${progressDone} / ${plan.numberOfInstallments}</div>
          </div>
        </div>
      </div>

      <!-- Financial Distribution Row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-4);margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--color-border)">
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Principal</div>
          <div style="font-size:18px;font-weight:600">${formatCurrency(plan.principalAmount)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Down Payment</div>
          <div style="font-size:18px;font-weight:600">${formatCurrency(plan.downPayment)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Total Collected</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-accent-green)">${formatCurrency(paidAmount)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Outstanding Balance</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-accent-red)">${formatCurrency(remainingDisplay)}</div>
        </div>
      </div>

      <!-- Settle Early CTA — only for active plans & manager+ -->
      ${canSettle ? `
        <div style="
          margin-top:var(--space-5);
          padding-top:var(--space-5);
          border-top:1px solid var(--color-border);
          display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-weight:600;font-size:14px">Early Settlement Available</div>
            <div style="font-size:13px;color:var(--color-text-secondary)">
              Clear the entire remaining balance in one action — the system calculates the exact amount automatically.
            </div>
          </div>
          <button id="btn-settle-early" class="btn btn-warning" style="
            background:linear-gradient(135deg,#f59e0b,#d97706);
            color:#000;font-weight:700;white-space:nowrap">
            ✦ Settle Remaining Balance
          </button>
        </div>
      ` : ''}
    </div>

    <!-- Schedule Table -->
    <div class="card" style="padding:0">
      <div class="card-header" style="border:none;padding:20px">
        <h4>Repayment Schedule</h4>
      </div>
      <div class="table-wrapper" style="border:none;border-radius:0">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Due Date</th>
              <th>Principal Due</th>
              <th>Markup</th>
              <th>Total Due</th>
              <th>Amount Paid</th>
              <th>Status</th>
              <th>Paid Date</th>
              <th style="text-align:right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${schedule.map(s => {
              const isSettled = s.status === 'settled';
              const isPaid    = s.status === 'paid';
              const rowStyle  = isSettled
                ? 'opacity:.55;'
                : '';

              return `
              <tr style="${rowStyle}">
                <td class="mono font-semibold">${s.installmentNumber}</td>
                <td class="secondary">${formatDate(s.dueDate)}</td>
                <td style="font-family:var(--font-mono)">${formatCurrency(s.principalDue || 0)}</td>
                <td style="font-family:var(--font-mono);color:var(--color-text-secondary)">
                  ${s.markupWaived > 0
                    ? `<span style="text-decoration:line-through;opacity:.5">${formatCurrency(s.markupAmount)}</span> <span style="color:var(--color-accent-green);font-size:11px">waived</span>`
                    : formatCurrency(s.markupAmount || 0)}
                </td>
                <td style="font-weight:600;font-family:var(--font-mono)">${formatCurrency(s.amountDue)}</td>
                <td style="font-family:var(--font-mono)">${s.amountPaid > 0 ? formatCurrency(s.amountPaid) : '—'}</td>
                <td><span class="badge badge-${s.status}">${capitalize(s.status)}</span></td>
                <td class="secondary">${s.paidDate ? formatDate(s.paidDate) : '—'}</td>
                <td style="text-align:right">
                  ${isPaid ? `
                    <button class="btn btn-sm btn-ghost view-receipt-btn" data-sched="${s.id}">
                      Receipt
                    </button>
                  ` : isSettled ? `
                    <span style="font-size:12px;color:var(--color-text-tertiary)">Settled early</span>
                  ` : `
                    <button class="btn btn-sm btn-success record-payment-btn"
                      data-id="${s.id}" data-num="${s.installmentNumber}" data-amount="${s.amountDue}">
                      Record Payment
                    </button>
                  `}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Donut chart
  const donutCont = document.getElementById('donut-progress-container');
  if (donutCont) {
    DonutChart(
      donutCont,
      progressPct,
      progressPct === 100 ? 'var(--color-accent-green)' : 'var(--color-accent-blue)',
    );
  }

  // ── Bind: Record Payment buttons ──
  document.querySelectorAll('.record-payment-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showPaymentModal(btn.dataset.id, btn.dataset.num, parseFloat(btn.dataset.amount), planId, () => init({ param: planId }));
    });
  });

  // ── Bind: View Receipt buttons ──
  document.querySelectorAll('.view-receipt-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const payListRes = await InstallmentsService.listPayments({ planId });
      const pay = (payListRes.data || []).find(p => p.scheduleId === btn.dataset.sched);
      if (pay) {
        window.location.hash = `/payments/${pay.id}`;
      } else {
        Toast.error('Receipt Error', 'No payment record found for this installment.');
      }
    });
  });

  // ── Bind: Settle Remaining Balance button ──
  const settleBtn = document.getElementById('btn-settle-early');
  if (settleBtn) {
    settleBtn.addEventListener('click', () => showSettlementModal(plan, () => init({ param: planId })));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Payment Modal (normal flow)
// ─────────────────────────────────────────────────────────────────────────────
function showPaymentModal(schedId, number, amount, planId, onSuccess) {
  const modal = Modal.create({
    title: 'Record Installment Payment',
    content: `
      <div class="form-grid">
        <div class="form-group full-width">
          <label class="form-label">Installment #</label>
          <input type="text" class="form-control" value="${number}" readonly disabled/>
        </div>
        <div class="form-group full-width">
          <label class="form-label">Amount Due (PKR)</label>
          <input type="number" id="pay-amount" class="form-control" value="${amount}" required/>
        </div>
        <div class="form-group full-width">
          <label class="form-label" for="pay-method">Payment Method</label>
          <select id="pay-method" class="form-control">
            <option value="cash">Cash</option>
            <option value="bank">Bank Transfer</option>
            <option value="online">Online App (JazzCash / Easypaisa)</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label class="form-label" for="pay-notes">Notes</label>
          <textarea id="pay-notes" class="form-control" placeholder="Optional details..."></textarea>
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary"   id="modal-confirm">Confirm Payment</button>`,
  });
  modal.open();

  modal.backdrop.querySelector('#modal-cancel').addEventListener('click', modal.destroy);
  modal.backdrop.querySelector('#modal-confirm').addEventListener('click', async () => {
    const payAmt = parseFloat(modal.backdrop.querySelector('#pay-amount').value);
    const method = modal.backdrop.querySelector('#pay-method').value;
    const notes  = modal.backdrop.querySelector('#pay-notes').value;

    if (isNaN(payAmt) || payAmt <= 0) {
      Toast.warning('Validation', 'Please enter a valid amount.');
      return;
    }

    const confirmBtn = modal.backdrop.querySelector('#modal-confirm');
    confirmBtn.classList.add('loading');

    const result = await InstallmentsService.recordPayment({ planId, scheduleId: schedId, amount: payAmt, method, notes });
    confirmBtn.classList.remove('loading');

    if (result.success) {
      Toast.success('Success', 'Payment recorded successfully.');
      modal.destroy();
      onSuccess();
    } else {
      Toast.error('Failed', result.error);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Settlement Modal — fetches live breakdown, shows confirmation
// ─────────────────────────────────────────────────────────────────────────────
async function showSettlementModal(plan, onSuccess) {
  // Open modal immediately with a loading state
  const modal = Modal.create({
    title: '✦ Settle Remaining Balance',
    content: `
      <div id="settlement-modal-body" style="min-height:160px;display:flex;align-items:center;justify-content:center">
        <div class="skeleton skeleton-text" style="width:100%;height:120px;border-radius:var(--radius-md)"></div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-warning" id="modal-confirm" disabled
        style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:700">
        Confirm Settlement
      </button>`,
  });
  modal.open();
  modal.backdrop.querySelector('#modal-cancel').addEventListener('click', modal.destroy);

  // Fetch live preview
  const previewRes = await InstallmentsService.getSettlementPreview(plan.id);

  if (!previewRes.success) {
    modal.backdrop.querySelector('#settlement-modal-body').innerHTML = `
      <div class="empty-state" style="padding:24px">
        <span style="font-size:32px">⚠️</span>
        <p style="color:var(--color-accent-red)">${previewRes.error || 'Failed to load settlement data.'}</p>
      </div>`;
    return;
  }

  const b = previewRes.data;

  if (!b.hasOpenRows) {
    modal.backdrop.querySelector('#settlement-modal-body').innerHTML = `
      <div class="empty-state" style="padding:24px">
        <span style="font-size:32px">✅</span>
        <p>All installments are already paid or settled — nothing to settle.</p>
      </div>`;
    return;
  }

  // Render the breakdown
  modal.backdrop.querySelector('#settlement-modal-body').innerHTML = `
    <p style="font-size:14px;color:var(--color-text-secondary);margin-bottom:16px">
      The system has calculated the exact amount to fully settle this plan as of today
      (<strong>${b.asOfDate}</strong>). Review and confirm below.
    </p>

    <!-- Breakdown table -->
    <div style="
      border-radius:var(--radius-md);
      overflow:hidden;
      border:1px solid var(--color-border);
      margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--color-border)">
        <span style="color:var(--color-text-secondary);font-size:13px">Remaining Principal</span>
        <span style="font-weight:600;font-family:var(--font-mono)">${formatCurrency(b.remainingPrincipal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--color-border)">
        <span style="color:var(--color-text-secondary);font-size:13px">
          Markup Earned to Date
          <span style="font-size:11px;opacity:.7">(periods already due — must be paid)</span>
        </span>
        <span style="font-weight:600;font-family:var(--font-mono);color:var(--color-accent-amber,#f59e0b)">${formatCurrency(b.markupEarnedToDate)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--color-border);background:rgba(34,197,94,.05)">
        <span style="color:var(--color-text-secondary);font-size:13px">
          Markup to Be Waived
          <span style="font-size:11px;opacity:.7">(future periods — fully forgiven)</span>
        </span>
        <span style="font-weight:600;font-family:var(--font-mono);color:var(--color-accent-green)">
          − ${formatCurrency(b.markupToWaive)}
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:14px 16px;background:var(--color-bg-secondary)">
        <span style="font-weight:700;font-size:15px">Total to Pay Now</span>
        <span style="font-weight:800;font-size:18px;font-family:var(--font-mono);color:var(--color-accent-blue)">
          ${formatCurrency(b.settlementAmount)}
        </span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group" style="margin:0">
        <label class="form-label" for="settle-method">Payment Method <span class="required">*</span></label>
        <select id="settle-method" class="form-control">
          <option value="cash">Cash</option>
          <option value="bank">Bank Transfer</option>
          <option value="online">Online (JazzCash / Easypaisa)</option>
        </select>
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label" for="settle-notes">Notes</label>
        <input type="text" id="settle-notes" class="form-control" placeholder="Optional reference / remarks"/>
      </div>
    </div>

    <div style="
      margin-top:16px;padding:12px 14px;
      border-radius:var(--radius-sm);
      background:rgba(245,158,11,.08);
      border:1px solid rgba(245,158,11,.3);
      font-size:13px;color:var(--color-text-secondary)">
      ⚠️ This action is <strong>irreversible</strong>. It will mark the plan as
      <strong>Completed</strong>, close all ${b.openRowCount} remaining installment
      row${b.openRowCount !== 1 ? 's' : ''}, and record one consolidated payment entry.
    </div>
  `;

  // Enable confirm button
  const confirmBtn = modal.backdrop.querySelector('#modal-confirm');
  confirmBtn.disabled = false;

  confirmBtn.addEventListener('click', async () => {
    const method = modal.backdrop.querySelector('#settle-method').value;
    const notes  = modal.backdrop.querySelector('#settle-notes').value;

    confirmBtn.classList.add('loading');
    confirmBtn.disabled = true;

    const result = await InstallmentsService.settleEarly(plan.id, { method, notes });

    confirmBtn.classList.remove('loading');
    confirmBtn.disabled = false;

    if (result.success) {
      Toast.success(
        '✨ Plan Settled',
        `${formatCurrency(b.settlementAmount)} received · ${formatCurrency(b.markupToWaive)} markup waived`,
        { duration: 6000 },
      );
      modal.destroy();
      onSuccess();
    } else {
      Toast.error('Settlement Failed', result.error);
    }
  });
}
