/**
 * receipt.js — Professional printable payment receipt
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import { formatCurrency, formatDate, Config } from '../config.js';
import AuthService from '../services/auth.service.js';
import SiteService from '../services/site.service.js';
import Modal from '../components/modal.js';
import Toast from '../components/toast.js';

export default async function init({ param }) {
  const paymentId = param;
  renderNavbar('Receipt', 'Payment proof');

  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="skeleton" style="height:500px;border-radius:var(--radius-md)"></div>`;

  await SiteService.load().catch(() => {});
  const site = SiteService.getCached();
  const receiptFooter = site?.web_content?.receiptFooter
    || 'This is a computer-generated receipt and is valid without a physical stamp.';

  const payRes = await InstallmentsService.getPaymentById(paymentId);
  if (!payRes.success) {
    content.innerHTML = `
      <div class="empty-state">
        <h3>Receipt not found</h3>
        <p>Payment ID "${paymentId}" could not be located.</p>
        <a href="#/payments" class="btn btn-primary mt-4">← Back to Payments</a>
      </div>
    `;
    return;
  }

  const p = payRes.data;
  const isReversed = p.status === 'reversed';
  let outstandingAfter = '—';
  if (p.planId) {
    const schedRes = await InstallmentsService.getSchedule(p.planId);
    if (schedRes.success) {
      const unpaid = (schedRes.data || []).filter(s => s.status !== 'paid' && s.status !== 'settled');
      outstandingAfter = formatCurrency(unpaid.reduce((sum, s) => sum + Math.max(0, Number(s.amountDue) - Number(s.amountPaid || 0)), 0));
    }
  }

  const installmentNo = p.installmentNumber || (p.isEarlySettlement ? 'Settlement' : '—');
  const receivedBy = p.receivedByName || AuthService.getUser()?.name || 'Sandhu IC Staff';
  const printDate = new Date().toLocaleDateString('en-PK', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  content.innerHTML = `
    <div class="breadcrumb no-print" style="margin-bottom:var(--space-5)">
      <a href="#/payments">Payments</a>
      <span class="sep">/</span>
      <span class="current">Receipt #${p.receiptNumber}</span>
    </div>

    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-5);flex-wrap:wrap;gap:var(--space-3)">
      <div style="font-size:14px;color:var(--color-text-secondary)">
        Professional receipt preview · print output is black & white
      </div>
      <div style="display:flex;gap:var(--space-3);flex-wrap:wrap">
        <a href="#/payments" class="btn btn-secondary">← Back</a>
        ${p.planId ? `<a href="#/installments/${p.planId}" class="btn btn-ghost">View Plan</a>` : ''}
        <button class="btn btn-primary" onclick="window.print()">Print Receipt</button>
        ${(AuthService.isAdmin() && !isReversed) ? `
          <button class="btn btn-danger" id="btn-revert-payment">Reverse Payment</button>
        ` : ''}
      </div>
    </div>

    <article class="receipt-card ${isReversed ? 'receipt-void' : ''}" id="printable-receipt"
      style="max-width:700px;margin:0 auto;padding:32px 36px;background:var(--color-bg-secondary);
             border:1px solid var(--color-border-strong);border-radius:var(--radius-lg);
             box-shadow:var(--shadow-md);position:relative">

      ${isReversed ? `<div class="receipt-void-stamp">VOID</div>` : ''}

      <header class="receipt-header" style="display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:3px double var(--color-border-strong)">
        <div>
          <div style="font-size:20px;font-weight:800;letter-spacing:.02em;color:var(--color-text-primary)">${Config.BUSINESS.NAME}</div>
          <div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px">${Config.BUSINESS.TAGLINE || ''}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:8px;line-height:1.5">
            ${Config.BUSINESS.ADDRESS}<br>
            ${Config.BUSINESS.PHONE} · ${Config.BUSINESS.EMAIL}
          </div>
        </div>
        <div style="text-align:right;min-width:180px">
          <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--color-accent-teal,#0F766E)">PAYMENT RECEIPT</div>
          ${isReversed ? `<div style="margin-top:6px;font-size:12px;font-weight:800;color:var(--color-accent-red)">REVERSED / VOID</div>` : ''}
          <div style="margin-top:10px;font-family:var(--font-mono);font-size:18px;font-weight:700">#${p.receiptNumber}</div>
          <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:4px">Printed ${printDate}</div>
        </div>
      </header>

      <section style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:22px 0;padding-bottom:18px;border-bottom:1px solid var(--color-border)">
        <div>
          <div class="receipt-section-label">Billed To</div>
          <div style="font-size:16px;font-weight:700">${p.customer?.fullName || 'Valued Customer'}</div>
          <div style="font-size:13px;color:var(--color-text-secondary);margin-top:6px;line-height:1.6">
            ${p.customer?.accountNumber ? `Account ID: <strong>${p.customer.accountNumber}</strong><br>` : ''}
            Phone: ${p.customer?.phone || '—'}<br>
            CNIC: ${p.customer?.cnicOrId || '—'}
          </div>
        </div>
        <div>
          <div class="receipt-section-label">Payment Details</div>
          <table class="receipt-meta-table">
            <tr><td>Payment Date</td><td><strong>${formatDate(p.paidAt)}</strong></td></tr>
            <tr><td>Method</td><td>${(p.method || '—').toUpperCase()}</td></tr>
            <tr><td>Plan</td><td>${p.planId || '—'}</td></tr>
            <tr><td>Installment</td><td>${installmentNo}</td></tr>
            ${p.isEarlySettlement ? `<tr><td>Type</td><td><strong>Early Settlement</strong></td></tr>` : ''}
          </table>
        </div>
      </section>

      <section style="margin:8px 0 24px;padding:22px;border:2px solid var(--color-border-strong);border-radius:var(--radius-md);text-align:center;background:var(--color-bg-elevated)">
        <div class="receipt-section-label" style="margin-bottom:8px">Amount Received</div>
        <div style="font-size:40px;font-weight:800;font-family:var(--font-mono);color:var(--color-accent-green);line-height:1">
          ${formatCurrency(p.amount)}
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--color-text-secondary)">
          ${Number(p.amount || 0).toLocaleString('en-PK')} Pakistan Rupees only
        </div>
        ${p.isEarlySettlement && Number(p.markupWaived || 0) > 0 ? `
          <div style="margin-top:12px;font-size:12px;font-weight:600;color:var(--color-accent-navy)">
            Markup waived: ${formatCurrency(p.markupWaived)}
          </div>` : ''}
      </section>

      <section style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-bottom:22px;background:var(--color-bg-primary)">
        <span style="font-size:13px;color:var(--color-text-secondary)">Outstanding after this payment</span>
        <strong style="font-family:var(--font-mono)">${outstandingAfter}</strong>
      </section>

      <section style="font-size:12px;color:var(--color-text-secondary);margin-bottom:28px">
        <strong>Received by:</strong> ${receivedBy}
        ${p.notes ? `<div style="margin-top:6px"><strong>Notes:</strong> ${p.notes}</div>` : ''}
        ${isReversed && p.reversalReason ? `<div style="margin-top:6px;color:var(--color-accent-red)"><strong>Reversal reason:</strong> ${p.reversalReason}</div>` : ''}
      </section>

      <footer style="display:flex;justify-content:space-between;gap:24px;padding-top:18px;border-top:1px solid var(--color-border)">
        <div style="text-align:center;flex:1">
          <div style="height:40px;border-bottom:1.5px solid var(--color-text-tertiary);margin-bottom:6px"></div>
          <div style="font-size:11px;font-weight:600;color:var(--color-text-tertiary)">Authorized Signature</div>
        </div>
        <div style="text-align:center;flex:1">
          <div style="height:40px;border-bottom:1.5px solid var(--color-text-tertiary);margin-bottom:6px"></div>
          <div style="font-size:11px;font-weight:600;color:var(--color-text-tertiary)">Customer Signature</div>
        </div>
      </footer>

      <div style="margin-top:18px;text-align:center;font-size:10px;color:var(--color-text-tertiary);border-top:1px dashed var(--color-border);padding-top:12px">
        ${receiptFooter}<br>
        ${Config.BUSINESS.PHONE} · ${Config.BUSINESS.EMAIL}
      </div>
    </article>

    <style>
      .receipt-section-label {
        font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
        color: var(--color-text-tertiary); font-weight: 700; margin-bottom: 8px;
      }
      .receipt-meta-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .receipt-meta-table td { padding: 3px 0; vertical-align: top; }
      .receipt-meta-table td:first-child { color: var(--color-text-secondary); width: 42%; }
      .receipt-void-stamp {
        position: absolute; top: 46%; left: 50%; transform: translate(-50%, -50%) rotate(-18deg);
        font-size: 72px; font-weight: 900; letter-spacing: .1em; color: rgba(220,38,38,.18);
        border: 6px solid rgba(220,38,38,.25); padding: 8px 28px; border-radius: 12px;
        pointer-events: none; z-index: 2;
      }
    </style>
  `;

  const revertBtn = document.getElementById('btn-revert-payment');
  if (revertBtn) {
    revertBtn.addEventListener('click', () => {
      const modal = Modal.create({
        title: 'Reverse Payment',
        content: `
          <p>Reverse <strong>${formatCurrency(p.amount)}</strong> dated <strong>${formatDate(p.paidAt)}</strong>? This re-opens the installment and removes the Roznamcha payment entry.</p>
          <div class="form-group" style="margin-top:16px">
            <label class="form-label">Reason for reversal <span class="required">*</span></label>
            <input type="text" id="reversal-reason" class="form-control" placeholder="E.g., Cheque bounced, entered by mistake" required minlength="5">
          </div>
        `,
        footer: `
          <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
          <button class="btn btn-danger" id="modal-confirm">Confirm Reversal</button>
        `,
      });
      modal.open();
      modal.backdrop.querySelector('#modal-cancel').addEventListener('click', modal.destroy);
      modal.backdrop.querySelector('#modal-confirm').addEventListener('click', async () => {
        const reason = modal.backdrop.querySelector('#reversal-reason').value;
        if (!reason || reason.length < 5) {
          Toast.warning('Validation', 'Please provide a reason of at least 5 characters.');
          return;
        }
        const confirmBtn = modal.backdrop.querySelector('#modal-confirm');
        confirmBtn.classList.add('loading');
        const result = await InstallmentsService.revertPayment(p.id, reason);
        confirmBtn.classList.remove('loading');
        if (result.success) {
          Toast.success('Reversed', 'Payment reversed successfully.');
          modal.destroy();
          init({ param });
        } else {
          Toast.error('Error', result.error);
        }
      });
    });
  }
}
