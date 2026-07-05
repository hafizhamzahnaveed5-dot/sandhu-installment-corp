/**
 * receipt.js — Printable transaction receipt
 *
 * Print layout is fully independent of app theme.
 * The print.css resets all CSS variables at :root so the output
 * is always plain black-on-white regardless of dark/light mode.
 *
 * Fields on every printed receipt:
 *   Business name, customer name, CNIC, plan ID,
 *   installment #, amount paid, payment date, receipt #,
 *   payment method, received-by, outstanding balance after payment.
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import { formatCurrency, formatDate, Config } from '../config.js';
import AuthService from '../services/auth.service.js';

export default async function init({ param }) {
  const paymentId = param;
  renderNavbar('Receipt', 'Payment proof');

  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="skeleton" style="height:500px;border-radius:var(--radius-md)"></div>`;

  const payRes = await InstallmentsService.getPaymentById(paymentId);
  if (!payRes.success) {
    content.innerHTML = `
      <div class="empty-state">
        <span style="font-size:60px">🔍</span>
        <h3>Receipt not found</h3>
        <p>Payment ID "${paymentId}" could not be located.</p>
        <a href="#/payments" class="btn btn-primary mt-4">← Back to Payments</a>
      </div>
    `;
    return;
  }

  const p = payRes.data;
  const currentUser = AuthService.getUser();

  // Calculate outstanding balance after this payment
  let outstandingAfter = '—';
  if (p.planId) {
    const schedRes = await InstallmentsService.getSchedule(p.planId);
    if (schedRes.success) {
      const unpaid = schedRes.data.filter(s => s.status !== 'paid');
      const totalDue = unpaid.reduce((sum, s) => sum + s.amountDue, 0);
      outstandingAfter = formatCurrency(totalDue);
    }
  }

  // Find installment number from schedule if available
  let installmentNo = p.installmentNumber || '—';

  const printDate = new Date().toLocaleDateString('en-PK', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  content.innerHTML = `
    <!-- Breadcrumb (screen only) -->
    <div class="breadcrumb no-print" style="margin-bottom:var(--space-5)">
      <a href="#/payments">Payments</a>
      <span class="sep">/</span>
      <span class="current">Receipt #${p.receiptNumber}</span>
    </div>

    <!-- Print action bar (screen only) -->
    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;
                                  margin-bottom:var(--space-5);flex-wrap:wrap;gap:var(--space-3)">
      <div style="font-size:14px;color:var(--color-text-secondary)">
        Receipt previewed below. The printed output is always black-and-white.
      </div>
      <div style="display:flex;gap:var(--space-3)">
        <a href="#/payments" class="btn btn-secondary">← Back</a>
        <button class="btn btn-primary" onclick="window.print()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print Receipt
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════
         RECEIPT CARD — this is what gets printed
         All styles inside here must work in @media print too.
         The print.css handles variable overrides.
         ═══════════════════════════════════════════════════════════ -->
    <div class="receipt-card" style="max-width:640px;margin:0 auto;position:relative">

      <!-- Business Header -->
      <div class="receipt-header" style="display:flex;justify-content:space-between;
                                          align-items:flex-start;padding-bottom:16px;
                                          border-bottom:2px solid var(--color-border)">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="receipt-logo-icon sidebar-logo-icon"
               style="width:44px;height:44px;border-radius:8px;
                      background:var(--color-accent-blue);display:flex;
                      align-items:center;justify-content:center;flex-shrink:0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--color-text-primary)">
              ${Config.BUSINESS.NAME}
            </div>
            <div style="font-size:11px;color:var(--color-text-tertiary)">
              ${Config.BUSINESS.ADDRESS}
            </div>
            <div style="font-size:11px;color:var(--color-text-tertiary)">
              ${Config.BUSINESS.PHONE}
            </div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:800;letter-spacing:.05em;
                      color:var(--color-accent-green)">PAYMENT RECEIPT</div>
          <div style="font-size:13px;font-family:var(--font-mono);font-weight:600;
                      color:var(--color-text-secondary);margin-top:4px">
            # ${p.receiptNumber}
          </div>
          <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:2px">
            Printed: ${printDate}
          </div>
        </div>
      </div>

      <!-- Customer & Transaction Info Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;
                  margin-top:20px;padding-bottom:20px;
                  border-bottom:1px solid var(--color-border)">
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;
                      color:var(--color-text-tertiary);font-weight:600;margin-bottom:8px">
            Customer Details
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--color-text-primary);margin-bottom:3px">
            ${p.customer?.fullName || 'Valued Customer'}
          </div>
          <div style="font-size:12px;color:var(--color-text-secondary)">
            📞 ${p.customer?.phone || '—'}
          </div>
          <div style="font-size:12px;color:var(--color-text-secondary)">
            🪪 CNIC: ${p.customer?.cnicOrId || '—'}
          </div>
        </div>
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;
                      color:var(--color-text-tertiary);font-weight:600;margin-bottom:8px">
            Transaction Details
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;font-size:12px">
            <div><strong>Date:</strong> ${formatDate(p.paidAt)}</div>
            <div><strong>Method:</strong> ${p.method?.toUpperCase() || '—'}</div>
            <div><strong>Plan ID:</strong> #${p.planId}</div>
            <div><strong>Installment #:</strong> ${installmentNo}</div>
          </div>
        </div>
      </div>

      <!-- Amount Box -->
      <div style="margin:24px 0;padding:24px;border:2px solid var(--color-border);
                  border-radius:var(--radius-md);text-align:center;
                  background:var(--color-bg-secondary)">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;
                    color:var(--color-text-tertiary);font-weight:600;margin-bottom:8px">
          Amount Collected
        </div>
        <div style="font-size:42px;font-weight:800;font-family:var(--font-mono);
                    color:var(--color-accent-green);line-height:1">
          ${formatCurrency(p.amount)}
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--color-text-secondary)">
          ${p.amount && p.amount.toLocaleString ? `PKR ${p.amount.toLocaleString('en-PK')} only` : ''}
        </div>
      </div>

      <!-- Outstanding Balance -->
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:12px 16px;border:1px solid var(--color-border);
                  border-radius:var(--radius-sm);margin-bottom:24px;
                  background:var(--color-bg-secondary)">
        <span style="font-size:13px;color:var(--color-text-secondary);font-weight:500">
          Outstanding Balance After This Payment:
        </span>
        <span style="font-size:14px;font-weight:700;font-family:var(--font-mono);
                     color:var(--color-text-primary)">
          ${outstandingAfter}
        </span>
      </div>

      <!-- Received By & Notes -->
      <div style="font-size:12px;color:var(--color-text-secondary);
                  margin-bottom:40px;padding:10px 14px;
                  border-left:3px solid var(--color-border)">
        <strong>Received by:</strong> ${currentUser?.name || 'Sandhu IC Staff'} &nbsp;|&nbsp;
        <strong>Date:</strong> ${printDate}
      </div>

      <!-- Signature Lines -->
      <div style="display:flex;justify-content:space-between;
                  padding-top:16px;border-top:1px solid var(--color-border)">
        <div style="text-align:center">
          <div style="width:160px;border-bottom:1.5px solid var(--color-text-tertiary);height:36px"></div>
          <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:5px;font-weight:600">
            Authorized Signature
          </div>
        </div>
        <div style="text-align:center">
          <div style="width:160px;border-bottom:1.5px solid var(--color-text-tertiary);height:36px"></div>
          <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:5px;font-weight:600">
            Customer Signature
          </div>
        </div>
      </div>

      <!-- Footer note -->
      <div style="margin-top:20px;text-align:center;font-size:10px;
                  color:var(--color-text-tertiary);border-top:1px dashed var(--color-border);
                  padding-top:12px">
        This is a computer-generated receipt and is valid without a physical stamp.
        For queries: ${Config.BUSINESS.PHONE} · ${Config.BUSINESS.EMAIL}
      </div>
    </div>
  `;
}
