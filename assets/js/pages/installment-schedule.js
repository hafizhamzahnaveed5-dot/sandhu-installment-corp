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

  const hasPaymentHistory = paidAmount > 0;
  const canDeletePlan = AuthService.hasMinRole('manager') && !hasPaymentHistory;

  // Can the current user initiate a settlement? (manager+)
  const canSettle = AuthService.hasMinRole('manager') && (plan.status === 'active' || plan.status === 'overdue') && remainingDisplay > 0;

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

      <div style="
        margin-top:var(--space-5);
        padding-top:var(--space-5);
        border-top:1px solid var(--color-border);
        display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-weight:600;font-size:14px">Plan Actions</div>
          <div style="font-size:13px;color:var(--color-text-secondary)">
            Manage this plan or remove it when no payment history exists.
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${canDeletePlan ? `
            <button id="btn-delete-plan" class="btn btn-danger btn-sm" style="white-space:nowrap">🗑 Delete Plan</button>
          ` : `
            <button class="btn btn-danger btn-sm" style="white-space:nowrap" disabled title="Delete is blocked because this plan already has payment history.">
              🗑 Delete Plan
            </button>
          `}
          ${canSettle ? `
            <button id="btn-settle-early" class="btn btn-warning" style="
              background:linear-gradient(135deg,#f59e0b,#d97706);
              color:#000;font-weight:700;white-space:nowrap">
              ✦ Settle Remaining Balance
            </button>
          ` : ''}
        </div>
      </div>

      ${hasPaymentHistory ? `
        <div style="
          margin-top:var(--space-4);
          padding:12px 14px;
          border-radius:var(--radius-md);
          background:rgba(239,68,68,.08);
          border:1px solid rgba(239,68,68,.22);
          color:var(--color-accent-red);
          font-size:13px">
          <strong>Delete blocked.</strong> This plan already has payment history, so it cannot be deleted. Please contact support or handle it manually.
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

  // ── Bind: Delete Plan button ──
  const deleteBtn = document.getElementById('btn-delete-plan');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => showDeletePlanModal(plan, () => {
      window.location.hash = '#/installments';
    }));
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
// Delete Plan Modal
// ─────────────────────────────────────────────────────────────────────────────
function showDeletePlanModal(plan, onSuccess) {
  const modal = Modal.create({
    title: 'Delete Installment Plan',
    content: `
      <div style="display:grid;gap:12px">
        <p style="margin:0;color:var(--color-text-secondary)">
          This will permanently delete this one installment plan and all of its installment schedule/history for the customer below.
        </p>
        <div style="padding:12px 14px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:rgba(239,68,68,.04)">
          <div><strong>Customer:</strong> ${plan.customerName}</div>
          <div><strong>Plan ID:</strong> ${plan.id}</div>
        </div>
        <div style="font-size:13px;color:var(--color-accent-red)">
          This will also remove any linked Roznamcha purchase/payment entries for this plan, but it will not delete the customer record or any other plans for this customer. This cannot be undone.
        </div>
        <div class="form-group">
          <label class="form-label" for="delete-plan-confirmation">Type <strong>Yes, delete this plan</strong> to confirm</label>
          <input id="delete-plan-confirmation" class="form-control" type="text" placeholder="Yes, delete this plan" />
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-secondary" id="delete-plan-cancel">Cancel</button>
      <button class="btn btn-danger" id="delete-plan-confirm" disabled>Yes, delete this plan</button>
    `,
  });

  const input = modal.backdrop.querySelector('#delete-plan-confirmation');
  const confirmBtn = modal.backdrop.querySelector('#delete-plan-confirm');
  const cancelBtn = modal.backdrop.querySelector('#delete-plan-cancel');

  const updateState = () => {
    confirmBtn.disabled = input.value.trim() !== 'Yes, delete this plan';
  };

  input.addEventListener('input', updateState);
  cancelBtn.addEventListener('click', () => modal.destroy());
  confirmBtn.addEventListener('click', async () => {
    if (input.value.trim() !== 'Yes, delete this plan') return;

    const res = await InstallmentsService.deletePlan(plan.id);
    if (!res.success) {
      Toast.error('Delete failed', res.error || 'Unable to delete this plan.');
      modal.destroy();
      return;
    }

    modal.destroy();
    Toast.success('Plan deleted', 'Plan deleted successfully.');
    onSuccess?.();
  });

  modal.open();
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Payment Modal (normal flow)
// ─────────────────────────────────────────────────────────────────────────────
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function showPaymentModal(schedId, number, amount, planId, onSuccess) {
  const today = localToday();
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
          <label class="form-label" for="pay-date">Payment Date (from your manual ledger)</label>
          <input type="date" id="pay-date" class="form-control" value="${today}" required />
          <span class="form-help">Use the real collection date — not today's date — when entering old ledger payments.</span>
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
    const payDate = modal.backdrop.querySelector('#pay-date').value;
    const method = modal.backdrop.querySelector('#pay-method').value;
    const notes  = modal.backdrop.querySelector('#pay-notes').value;

    if (isNaN(payAmt) || payAmt <= 0) {
      Toast.warning('Validation', 'Please enter a valid amount.');
      return;
    }
    if (!payDate) {
      Toast.warning('Validation', 'Please select a payment date.');
      return;
    }

    const confirmBtn = modal.backdrop.querySelector('#modal-confirm');
    confirmBtn.classList.add('loading');

    const result = await InstallmentsService.recordPayment({
      planId,
      scheduleId: schedId,
      amount: payAmt,
      paidAt: payDate,
      method,
      notes,
    });
    confirmBtn.classList.remove('loading');

    if (result.success) {
      Toast.success('Success', `Payment recorded for ${payDate}.`);
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
    size: 'lg',
    content: `
      <div id="settlement-modal-body">
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
  const body = modal.backdrop.querySelector('#settlement-modal-body');

  if (!previewRes.success) {
    body.innerHTML = `
      <div class="empty-state" style="padding:24px;text-align:center">
        <span style="font-size:32px">⚠️</span>
        <p style="color:var(--color-accent-red)">${previewRes.error || 'Failed to load settlement data.'}</p>
      </div>`;
    return;
  }

  const b = previewRes.data;

  if (!b.hasOpenRows) {
    body.innerHTML = `
      <div class="empty-state" style="padding:24px;text-align:center">
        <span style="font-size:32px">✅</span>
        <p>All installments are already paid or settled — nothing to settle.</p>
      </div>`;
    return;
  }

  const suggested = Number(b.settlementAmount || 0);

  // Render clear stacked layout (never use flex row on this container)
  body.innerHTML = `
    <p style="font-size:14px;color:var(--color-text-secondary);margin:0 0 16px;line-height:1.5">
      Calculated settlement as of <strong>${formatDate(b.asOfDate)}</strong>.
      Enter the amount you received, then confirm.
    </p>

    <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;margin-bottom:20px">
      <div class="settle-row">
        <span>Remaining Principal</span>
        <strong class="mono">${formatCurrency(b.remainingPrincipal)}</strong>
      </div>
      <div class="settle-row">
        <span>Markup Due Now <small>(already earned)</small></span>
        <strong class="mono" style="color:var(--color-accent-amber,#f59e0b)">${formatCurrency(b.markupEarnedToDate)}</strong>
      </div>
      <div class="settle-row" style="background:rgba(34,197,94,.06)">
        <span>Markup Waived <small>(future — forgiven)</small></span>
        <strong class="mono" style="color:var(--color-accent-green)">− ${formatCurrency(b.markupToWaive)}</strong>
      </div>
      <div class="settle-row" style="background:var(--color-bg-secondary)">
        <span style="font-weight:700">Suggested Total</span>
        <strong class="mono" style="font-size:18px;color:var(--color-accent-blue)">${formatCurrency(suggested)}</strong>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:16px">
      <label class="form-label" for="settle-amount">
        Amount Received (PKR) <span class="required">*</span>
      </label>
      <input type="number" id="settle-amount" class="form-control"
        min="1" step="0.01" required
        value="${suggested}"
        style="font-size:18px;font-weight:700;font-family:var(--font-mono)" />
      <small class="form-help">Type the cash/transfer amount you actually received from the customer.</small>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div class="form-group" style="margin:0;min-width:0">
        <label class="form-label" for="settle-date">Settlement Date</label>
        <input type="date" id="settle-date" class="form-control" value="${b.asOfDate || new Date().toISOString().slice(0,10)}"/>
      </div>
      <div class="form-group" style="margin:0;min-width:0">
        <label class="form-label" for="settle-method">Payment Method <span class="required">*</span></label>
        <select id="settle-method" class="form-control">
          <option value="cash">Cash</option>
          <option value="bank">Bank Transfer</option>
          <option value="online">Online (JazzCash / Easypaisa)</option>
        </select>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:16px">
      <label class="form-label" for="settle-notes">Notes</label>
      <input type="text" id="settle-notes" class="form-control" placeholder="Optional reference / remarks"/>
    </div>

    <div style="
      padding:12px 14px;border-radius:var(--radius-sm);
      background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);
      font-size:13px;color:var(--color-text-secondary);line-height:1.45">
      ⚠️ Confirming will mark the plan <strong>Completed</strong>, close
      ${b.openRowCount} remaining installment${b.openRowCount !== 1 ? 's' : ''},
      and record one payment for the amount received.
    </div>
  `;

  // Enable confirm button
  const confirmBtn = modal.backdrop.querySelector('#modal-confirm');
  confirmBtn.disabled = false;

  confirmBtn.addEventListener('click', async () => {
    const amountRaw = modal.backdrop.querySelector('#settle-amount')?.value;
    const amount = parseFloat(amountRaw);
    const method = modal.backdrop.querySelector('#settle-method').value;
    const notes  = modal.backdrop.querySelector('#settle-notes').value;
    const paidAt = modal.backdrop.querySelector('#settle-date')?.value || b.asOfDate;

    if (!Number.isFinite(amount) || amount <= 0) {
      Toast.warning('Amount required', 'Enter the amount you received from the customer.');
      modal.backdrop.querySelector('#settle-amount')?.focus();
      return;
    }

    confirmBtn.classList.add('loading');
    confirmBtn.disabled = true;

    const result = await InstallmentsService.settleEarly(plan.id, { method, notes, paidAt, amount });

    confirmBtn.classList.remove('loading');
    confirmBtn.disabled = false;

    if (result.success) {
      Toast.success(
        '✨ Plan Settled',
        `${formatCurrency(amount)} received · ${formatCurrency(b.markupToWaive)} markup waived`,
        { duration: 6000 },
      );
      modal.destroy();
      onSuccess();
    } else {
      Toast.error('Settlement Failed', result.error);
    }
  });
}
