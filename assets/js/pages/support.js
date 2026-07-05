/**
 * support.js — Help center and static informational views
 */

import { renderNavbar } from '../components/navbar.js';

export default async function init({ param }) {
  renderNavbar('Support & Static Content', 'Information pages');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Help &amp; Support</h1>
        <p>Frequently Asked Questions &amp; Agreements</p>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-6">
      <div class="card">
        <h3>Frequently Asked Questions</h3>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px">
          <div>
            <strong>How do I record an installment?</strong>
            <p style="font-size:13px">Go to Installments -> select a Plan -> click "Record Payment".</p>
          </div>
          <div>
            <strong>What database is expected?</strong>
            <p style="font-size:13px">Any ACID-compliant relational DB (PostgreSQL / MySQL).</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Contact Info</h3>
        <p style="margin-top:12px;font-size:14px">
          <strong>Email:</strong> support@sandhuinstallments.com<br>
          <strong>Phone:</strong> +92-300-1234567
        </p>
      </div>
    </div>
  `;
}
