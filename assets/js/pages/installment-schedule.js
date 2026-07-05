/**
 * installment-schedule.js — Visual installment schedule/timeline per plan
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import CustomersService from '../services/customers.service.js';
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

  const plan = planRes.data;
  const schedule = schedRes.data || [];

  const paidRows = schedule.filter(s => s.status === 'paid');
  const paidAmount = paidRows.reduce((sum, s) => sum + s.amountPaid, 0);
  const totalAmount = plan.numberOfInstallments * plan.installmentAmount;
  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const progressPercent = Math.round((paidRows.length / plan.numberOfInstallments) * 100) || 0;

  content.innerHTML = `
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
            Markup: ${plan.interestOrMarkup}% &nbsp;·&nbsp; Start Date: ${formatDate(plan.startDate)}
          </div>
        </div>

        <!-- Donut Progress -->
        <div style="display:flex;align-items:center;gap:16px">
          <div id="donut-progress-container"></div>
          <div>
            <div style="font-size:12px;color:var(--color-text-tertiary)">Installments Paid</div>
            <div style="font-size:18px;font-weight:700">${paidRows.length} / ${plan.numberOfInstallments}</div>
          </div>
        </div>
      </div>

      <!-- Financial Distribution Row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-4);margin-top:var(--space-6);padding-top:var(--space-5);border-top:1px solid var(--color-border)">
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Principal Price</div>
          <div style="font-size:18px;font-weight:600">${formatCurrency(plan.principalAmount)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Down Payment</div>
          <div style="font-size:18px;font-weight:600">${formatCurrency(plan.downPayment)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Total Paid</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-accent-green)">${formatCurrency(paidAmount)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">Outstanding Balance</div>
          <div style="font-size:18px;font-weight:600;color:var(--color-accent-red)">${formatCurrency(remainingAmount)}</div>
        </div>
      </div>
    </div>

    <!-- Schedule List -->
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
              <th>Amount Due</th>
              <th>Amount Paid</th>
              <th>Status</th>
              <th>Paid Date</th>
              <th style="text-align:right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${schedule.map(s => `
              <tr>
                <td class="mono font-semibold">${s.installmentNumber}</td>
                <td class="secondary">${formatDate(s.dueDate)}</td>
                <td style="font-weight:600;font-family:var(--font-mono)">${formatCurrency(s.amountDue)}</td>
                <td style="font-family:var(--font-mono)">${s.amountPaid > 0 ? formatCurrency(s.amountPaid) : '—'}</td>
                <td><span class="badge badge-${s.status}">${capitalize(s.status)}</span></td>
                <td class="secondary">${s.paidDate ? formatDate(s.paidDate) : '—'}</td>
                <td style="text-align:right">
                  ${s.status !== 'paid' ? `
                    <button class="btn btn-sm btn-success record-payment-btn" 
                      data-id="${s.id}" data-num="${s.installmentNumber}" data-amount="${s.amountDue}">
                      Record Payment
                    </button>
                  ` : `
                    <button class="btn btn-sm btn-ghost view-receipt-btn" data-plan="${plan.id}" data-sched="${s.id}">
                      Receipt
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Donut chart rendering
  const donutCont = document.getElementById('donut-progress-container');
  if (donutCont) {
    DonutChart(donutCont, progressPercent, progressPercent === 100 ? 'var(--color-accent-green)' : 'var(--color-accent-blue)');
  }

  // Bind events
  document.querySelectorAll('.record-payment-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const schedId = btn.dataset.id;
      const amount = parseFloat(btn.dataset.amount);
      const number = btn.dataset.num;
      showPaymentModal(schedId, number, amount, planId);
    });
  });

  document.querySelectorAll('.view-receipt-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      // Find matching payment to view receipt
      const payListRes = await InstallmentsService.listPayments({ planId });
      const pay = (payListRes.data || []).find(p => p.scheduleId === btn.dataset.sched);
      if (pay) {
        window.location.hash = `/payments/${pay.id}`;
      } else {
        Toast.error('Receipt Error', 'No payment record found for this installment.');
      }
    });
  });
}

function showPaymentModal(schedId, number, amount, planId) {
  const formHtml = `
    <div class="form-grid">
      <div class="form-group full-width">
        <label class="form-label">Installment #</label>
        <input type="text" class="form-control" value="${number}" readonly disabled/>
      </div>
      <div class="form-group full-width">
        <label class="form-label">Amount due (PKR)</label>
        <input type="number" id="pay-amount" class="form-control" value="${amount}" required/>
      </div>
      <div class="form-group full-width">
        <label class="form-label" for="pay-method">Payment Method</label>
        <select id="pay-method" class="form-control">
          <option value="cash">Cash</option>
          <option value="bank">Bank Transfer</option>
          <option value="online">Online App (JazzCash/Easypaisa)</option>
        </select>
      </div>
      <div class="form-group full-width">
        <label class="form-label" for="pay-notes">Notes</label>
        <textarea id="pay-notes" class="form-control" placeholder="Optional details..."></textarea>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn btn-primary" id="modal-confirm">Confirm Payment</button>
  `;

  const modal = Modal.create({ title: 'Record Installment Payment', content: formHtml, footer });
  modal.open();

  modal.backdrop.querySelector('#modal-cancel').addEventListener('click', modal.destroy);
  modal.backdrop.querySelector('#modal-confirm').addEventListener('click', async () => {
    const payAmt = parseFloat(modal.backdrop.querySelector('#pay-amount').value);
    const method = modal.backdrop.querySelector('#pay-method').value;
    const notes = modal.backdrop.querySelector('#pay-notes').value;

    if (isNaN(payAmt) || payAmt <= 0) {
      Toast.warning('Validation', 'Please enter a valid amount.');
      return;
    }

    const confirmBtn = modal.backdrop.querySelector('#modal-confirm');
    confirmBtn.classList.add('loading');

    const result = await InstallmentsService.recordPayment({
      planId: planId,
      scheduleId: schedId,
      amount: payAmt,
      method,
      receivedBy: 'user-001',
      notes
    });

    confirmBtn.classList.remove('loading');

    if (result.success) {
      Toast.success('Success', 'Payment recorded successfully.');
      modal.destroy();
      // Reload page to reflect updates
      init({ param: planId });
    } else {
      Toast.error('Failed', result.error);
    }
  });
}
