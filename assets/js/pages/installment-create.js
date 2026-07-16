/**
 * installment-create.js — Creation flow for installment plans
 */

import { renderNavbar } from '../components/navbar.js';
import CustomersService from '../services/customers.service.js';
import InstallmentsService from '../services/installments.service.js';
import Toast from '../components/toast.js';
import { formatCurrency } from '../config.js';

export default async function init() {
  renderNavbar('Create Installment Plan', 'Add a new installment agreement for a customer');

  const content = document.getElementById('page-content');

  const customersRes = await CustomersService.list({ pageSize: 999 });
  const customers = customersRes.data || [];

  // Extract URL parameters if preselected
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
  const preSelectedCustomerId = urlParams.get('customerId') || '';

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>New Installment Plan</h1>
        <p>Set up down payment, installments, and payment frequency.</p>
      </div>
    </div>

    <div class="card" style="max-width: 800px; margin: 0 auto">
      <!-- Steps Indicator -->
      <div class="steps">
        <div class="step active" id="step-1-indicator">
          <div class="step-num">1</div>
          <div class="step-label">Select Customer</div>
        </div>
        <div class="step" id="step-2-indicator">
          <div class="step-num">2</div>
          <div class="step-label">Financial Details</div>
        </div>
      </div>

      <form id="create-plan-form">
        <!-- STEP 1: Select Customer and Product -->
        <div id="step-1-content">
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label" for="plan-account-id">Customer ID / Account No. <span class="required">*</span></label>
              <div style="display:flex;gap:10px">
                <input type="text" id="plan-account-id" class="form-control" placeholder="Type manual customer ID e.g. 1042" value="">
                <button type="button" class="btn btn-secondary" id="btn-lookup-customer" style="flex-shrink:0">Find</button>
              </div>
              <small class="form-help">Use the same customer ID from your manual ledger / Roznamcha.</small>
              <div id="plan-customer-match" class="secondary" style="margin-top:8px"></div>
            </div>

            <div class="form-group full-width">
              <label class="form-label" for="plan-customer">Or Select Customer</label>
              <select id="plan-customer" class="form-control" required>
                <option value="">-- Choose Customer --</option>
                ${customers.map(c => `
                  <option value="${c.id}" data-account="${c.accountNumber || ''}" ${c.id === preSelectedCustomerId ? 'selected' : ''}>
                    ${c.accountNumber ? `[${c.accountNumber}] ` : ''}${c.fullName} (${c.phone}) — ${formatCurrency(c.totalOutstanding)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group full-width">
              <label class="form-label" for="plan-product-name">Product Name</label>
              <input type="text" id="plan-product-name" class="form-control"
                placeholder="e.g. Samsung Fridge, Honda Bike, Sofa Set" maxlength="200" />
              <small class="form-help">Type what you bought for the customer (no stock catalog needed).</small>
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;margin-top:24px">
            <button type="button" class="btn btn-primary" id="btn-next-step">Next Step</button>
          </div>
        </div>

        <!-- STEP 2: Financial Configuration -->
        <div id="step-2-content" class="hidden">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label" for="plan-principal">Invoice / Sale Price <span class="required">*</span></label>
              <input type="number" id="plan-principal" class="form-control" required min="1000" placeholder="e.g. 50000"/>
            </div>

            <div class="form-group">
              <label class="form-label" for="plan-discount">Discount Amount</label>
              <div style="display:flex;gap:12px;align-items:center">
                <input type="number" id="plan-discount" class="form-control" min="0" step="0.01" value="0" placeholder="e.g. 1000" />
                <button type="button" class="btn btn-secondary" id="btn-apply-discount" style="flex-shrink:0">Apply Discount</button>
              </div>
              <small class="form-help">Enter a discount to reduce the final payable installment total; invoice price stays unchanged.</small>
            </div>

            <div class="form-group">
              <label class="form-label" for="plan-purchase-cost">Actual Purchase Cost <span class="required">*</span></label>
              <input type="number" id="plan-purchase-cost" class="form-control" required min="0" placeholder="e.g. 45000"/>
            </div>

            <div class="form-group">
              <label class="form-label" for="plan-file-fee">File Fee</label>
              <input type="number" id="plan-file-fee" class="form-control" min="0" value="0" placeholder="e.g. 500" />
              <small class="form-help">Optional administrative/file fee added to the total payable amount.</small>
            </div>

            <div class="form-group">
              <label class="form-label" for="plan-downpayment">Down Payment <span class="required">*</span></label>
              <input type="number" id="plan-downpayment" class="form-control" required min="0" value="0"/>
            </div>

            <div class="form-group">
              <label class="form-label" for="plan-markup">Markup/Interest Rate (%)</label>
              <input type="number" id="plan-markup" class="form-control" min="0" value="0"/>
            </div>

            <div class="form-group">
              <label class="form-label" for="plan-installment-amount">Installment Amount (per payment) <span class="required">*</span></label>
              <input type="number" id="plan-installment-amount" class="form-control" required min="1" step="0.01" placeholder="e.g. 7000" />
            </div>

            <div class="form-group">
              <label class="form-label" for="plan-frequency">Payment Frequency</label>
              <select id="plan-frequency" class="form-control">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="plan-startdate">Start Date <span class="required">*</span></label>
              <input type="date" id="plan-startdate" class="form-control" required/>
            </div>
          </div>

          <!-- Summary Calculations Card -->
          <div style="margin-top:24px;padding:20px;background:var(--color-bg-secondary);border-radius:var(--radius-md);border:1px solid var(--color-border)">
            <h4 style="margin-bottom:12px">Calculation Summary</h4>
            <div class="info-row">
              <span class="info-label">Net Financed Amount:</span>
              <span class="info-value" id="summary-net">PKR 0</span>
            </div>
            <div class="info-row">
              <span class="info-label">Purchase Cost:</span>
              <span class="info-value" id="summary-purchase-cost">PKR 0</span>
            </div>
            <div class="info-row">
              <span class="info-label">File Fee:</span>
              <span class="info-value" id="summary-file-fee">PKR 0</span>
            </div>
            <div class="info-row">
              <span class="info-label">Discount Amount:</span>
              <span class="info-value" id="summary-discount">PKR 0</span>
            </div>
            <div class="info-row">
              <span class="info-label">Invoice Price:</span>
              <span class="info-value" id="summary-invoice-price">PKR 0</span>
            </div>
            <div class="info-row">
              <span class="info-label">Cost Gap:</span>
              <span class="info-value" id="summary-cost-gap">PKR 0</span>
            </div>
            <div class="info-row">
              <span class="info-label">Markup Amount:</span>
              <span class="info-value" id="summary-markup">PKR 0</span>
            </div>
            <div class="info-row">
              <span class="info-label">Total Payable:</span>
              <span class="info-value" id="summary-total-payable">PKR 0</span>
            </div>
            <div class="info-row" style="border-bottom:none">
              <span class="info-label">Estimated Installment (Principal + Markup):</span>
              <span class="info-value" id="summary-installment" style="font-size:16px;color:var(--color-accent-blue);font-weight:700">PKR 0</span>
            </div>
            <div class="info-row" style="border-bottom:none;margin-top:12px">
              <span class="info-label">Installment Preview:</span>
              <span class="info-value" id="summary-preview" style="font-size:14px;color:var(--color-text-secondary);white-space:normal;max-width:420px">Enter installment amount to see plan preview.</span>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;margin-top:24px">
            <button type="button" class="btn btn-secondary" id="btn-prev-step">Back</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-plan">Create Plan</button>
          </div>
        </div>
      </form>
    </div>
  `;

  // Set default start date to today (local calendar)
  const _now = new Date();
  document.getElementById('plan-startdate').value = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;

  const step1Cont = document.getElementById('step-1-content');
  const step2Cont = document.getElementById('step-2-content');
  const step1Ind  = document.getElementById('step-1-indicator');
  const step2Ind  = document.getElementById('step-2-indicator');

  const principalInput = document.getElementById('plan-principal');
  const customerSelect = document.getElementById('plan-customer');
  const accountInput = document.getElementById('plan-account-id');
  const matchEl = document.getElementById('plan-customer-match');

  function selectCustomerByAccount(accountId) {
    const needle = String(accountId || '').trim().toLowerCase();
    if (!needle) return false;
    const option = [...customerSelect.options].find(opt =>
      String(opt.dataset.account || '').trim().toLowerCase() === needle
    );
    if (!option) {
      matchEl.textContent = `No customer found with ID "${accountId}". Add the customer first with this Account No.`;
      matchEl.style.color = 'var(--color-accent-red)';
      return false;
    }
    customerSelect.value = option.value;
    matchEl.textContent = `Matched: ${option.textContent.trim()}`;
    matchEl.style.color = 'var(--color-accent-green)';
    return true;
  }

  document.getElementById('btn-lookup-customer')?.addEventListener('click', () => {
    selectCustomerByAccount(accountInput.value);
  });
  accountInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      selectCustomerByAccount(accountInput.value);
    }
  });
  customerSelect?.addEventListener('change', () => {
    const opt = customerSelect.options[customerSelect.selectedIndex];
    if (opt?.dataset?.account) accountInput.value = opt.dataset.account;
    matchEl.textContent = opt?.value ? `Selected: ${opt.textContent.trim()}` : '';
    matchEl.style.color = '';
  });
  if (preSelectedCustomerId) {
    const opt = customerSelect.options[customerSelect.selectedIndex];
    if (opt?.dataset?.account) accountInput.value = opt.dataset.account;
  }

  // Financial inputs listener
  ['plan-principal', 'plan-discount', 'plan-purchase-cost', 'plan-file-fee', 'plan-downpayment', 'plan-markup', 'plan-installment-amount'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', recalculate);
  });

  document.getElementById('btn-apply-discount')?.addEventListener('click', () => {
    const principal = parseFloat(principalInput.value) || 0;
    const discount = parseFloat(document.getElementById('plan-discount').value) || 0;

    if (discount > principal) {
      Toast.warning('Validation', 'Discount cannot exceed the invoice price.');
      return;
    }

    recalculate();
  });

  // Navigation Logic
  document.getElementById('btn-next-step')?.addEventListener('click', () => {
    if (accountInput.value.trim() && !customerSelect.value) {
      selectCustomerByAccount(accountInput.value);
    }
    const custVal = customerSelect.value;
    if (!custVal) {
      Toast.warning('Validation', 'Enter Customer ID / Account No. and Find, or select a customer.');
      return;
    }
    step1Cont.classList.add('hidden');
    step2Cont.classList.remove('hidden');
    step1Ind.classList.add('completed');
    step2Ind.classList.add('active');
    recalculate();
  });

  document.getElementById('btn-prev-step')?.addEventListener('click', () => {
    step2Cont.classList.add('hidden');
    step1Cont.classList.remove('hidden');
    step1Ind.classList.remove('completed');
    step2Ind.classList.remove('active');
  });

  // Submit Plan
  document.getElementById('create-plan-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-plan');

    const customerId = document.getElementById('plan-customer').value;
    const productName = (document.getElementById('plan-product-name')?.value || '').trim();
    const principalAmount = parseFloat(principalInput.value);
    const purchaseCost = parseFloat(document.getElementById('plan-purchase-cost').value) || 0;
    const fileFee = parseFloat(document.getElementById('plan-file-fee').value) || 0;
    const discountAmountRaw = parseFloat(document.getElementById('plan-discount').value);
    const discountAmount = Number.isFinite(discountAmountRaw) ? discountAmountRaw : 0;
    const downPayment = parseFloat(document.getElementById('plan-downpayment').value) || 0;
    const markupRate = parseFloat(document.getElementById('plan-markup').value) || 0;
    const installmentAmount = parseFloat(document.getElementById('plan-installment-amount').value);
    const frequency = document.getElementById('plan-frequency').value;
    const startDate = document.getElementById('plan-startdate').value;

    if (discountAmount < 0) {
      Toast.warning('Validation error', 'Discount must be zero or a positive amount.');
      return;
    }
    if (discountAmount > principalAmount) {
      Toast.warning('Validation error', 'Discount cannot exceed the invoice price.');
      return;
    }
    if (purchaseCost > principalAmount) {
      Toast.warning('Validation error', 'Purchase cost cannot exceed the invoice price.');
      return;
    }
    if (fileFee < 0) {
      Toast.warning('Validation error', 'File fee cannot be negative.');
      return;
    }
    if (isNaN(installmentAmount) || installmentAmount <= 0) {
      Toast.warning('Validation error', 'Installment amount must be greater than 0.');
      return;
    }

    const netFinanced = Math.max(principalAmount - downPayment, 0);
    const totalMarkup = Number((principalAmount * (markupRate / 100)).toFixed(2));
    const grossPayable = Number((netFinanced + totalMarkup + fileFee).toFixed(2));
    const totalPayable = Number((grossPayable - discountAmount).toFixed(2));

    if (discountAmount >= grossPayable) {
      Toast.warning('Validation error', 'Discount cannot be greater than or equal to the total payable amount.');
      return;
    }

    if (installmentAmount > totalPayable) {
      Toast.warning('Validation error', 'Installment amount cannot be greater than total amount.');
      return;
    }

    btn.classList.add('loading');
    btn.textContent = '';

    const result = await InstallmentsService.createPlan({
      customerId,
      productId: null,
      productName: productName || null,
      principalAmount: principalAmount,
      discountAmount,
      purchaseCost,
      fileFee,
      downPayment,
      installmentAmount,
      frequency,
      startDate,
      interestOrMarkup: markupRate,
      createdBy: 'user-001'
    });

    btn.classList.remove('loading');
    btn.textContent = 'Create Plan';

    if (result.success) {
      Toast.success('Success', 'Installment plan created successfully.');
      setTimeout(() => {
        window.location.hash = `/installments/${result.data.id}`;
      }, 500);
    } else {
      Toast.error('Failure', result.error);
    }
  });

  function round2(value) {
    return Number(Number((value || 0)).toFixed(2));
  }

  function recalculate() {
    const principal = parseFloat(principalInput.value) || 0;
    const purchaseCost = parseFloat(document.getElementById('plan-purchase-cost').value) || 0;
    const fileFee = parseFloat(document.getElementById('plan-file-fee').value) || 0;
    const downPayment = parseFloat(document.getElementById('plan-downpayment').value) || 0;
    const markupPercent = parseFloat(document.getElementById('plan-markup').value) || 0;
    const installmentAmount = parseFloat(document.getElementById('plan-installment-amount')?.value) || 0;

    const discount = round2(Math.max(parseFloat(document.getElementById('plan-discount').value) || 0, 0));
    const invoicePrice = round2(principal);
    const net = round2(Math.max(invoicePrice - downPayment, 0));
    const markup = round2(invoicePrice * (markupPercent / 100));
    const costGap = round2(invoicePrice - purchaseCost);
    const grossPayable = round2(net + markup + fileFee);
    const payableRaw = grossPayable - discount;
    const totalPayable = round2(payableRaw > 0 ? payableRaw : 0);

    let preview = 'Enter installment amount to see plan preview.';
    if (installmentAmount > 0) {
      if (discount >= grossPayable) {
        preview = 'Discount cannot be greater than or equal to the total payable amount.';
      } else if (installmentAmount > totalPayable) {
        preview = 'Installment amount cannot be greater than total amount.';
      } else {
        const regularCount = Math.floor(grossPayable / installmentAmount);
        const remainder = round2(grossPayable - regularCount * installmentAmount);
        const scheduleAmounts = Array(regularCount).fill(installmentAmount);
        if (remainder > 0) scheduleAmounts.push(remainder);
        if (scheduleAmounts.length === 0 && grossPayable > 0) scheduleAmounts.push(grossPayable);

        let discountRemaining = discount;
        for (let i = scheduleAmounts.length - 1; i >= 0 && discountRemaining > 0; i -= 1) {
          const reduction = Math.min(scheduleAmounts[i], discountRemaining);
          scheduleAmounts[i] = round2(scheduleAmounts[i] - reduction);
          discountRemaining = round2(discountRemaining - reduction);
        }

        if (discountRemaining > 0) {
          preview = 'Discount cannot be applied without making the last installment invalid.';
        } else {
          const totalInstallments = scheduleAmounts.length;
          const finalAmount = scheduleAmounts[scheduleAmounts.length - 1];
          if (totalInstallments === 1) {
            preview = `This will create 1 installment of ${formatCurrency(finalAmount)}.`;
          } else {
            preview = `This will create ${totalInstallments - 1} installments of ${formatCurrency(installmentAmount)} and 1 final installment of ${formatCurrency(finalAmount)} (Total: ${totalInstallments} installments).`;
          }
          if (discount > 0) {
            preview += ` Discount is applied to the last installment only.`;
          }
        }
      }
    }

    document.getElementById('summary-net').textContent = formatCurrency(net);
    document.getElementById('summary-purchase-cost').textContent = formatCurrency(purchaseCost);
    document.getElementById('summary-file-fee').textContent = formatCurrency(fileFee);
    document.getElementById('summary-discount').textContent = formatCurrency(discount);
    document.getElementById('summary-invoice-price').textContent = formatCurrency(invoicePrice);
    document.getElementById('summary-cost-gap').textContent = formatCurrency(costGap);
    document.getElementById('summary-markup').textContent = formatCurrency(markup);
    document.getElementById('summary-total-payable').textContent = formatCurrency(totalPayable);
    document.getElementById('summary-installment').textContent = installmentAmount > 0 ? formatCurrency(installmentAmount) : 'PKR 0';
    document.getElementById('summary-preview').textContent = preview;
  }
}
