/**
 * installment-create.js — Creation flow for installment plans
 */

import { renderNavbar } from '../components/navbar.js';
import CustomersService from '../services/customers.service.js';
import InstallmentsService from '../services/installments.service.js';
import ProductsService from '../services/products.service.js';
import Toast from '../components/toast.js';
import { formatCurrency } from '../config.js';

export default async function init() {
  renderNavbar('Create Installment Plan', 'Add a new installment agreement for a customer');

  const content = document.getElementById('page-content');

  // Load customer and product lists for selection dropdown
  const [customersRes, productsRes] = await Promise.all([
    CustomersService.list({ pageSize: 999 }),
    ProductsService.list()
  ]);
  const customers = customersRes.data || [];
  const products = productsRes.data || [];

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
              <label class="form-label" for="plan-customer">Select Customer <span class="required">*</span></label>
              <select id="plan-customer" class="form-control" required>
                <option value="">-- Choose Customer --</option>
                ${customers.map(c => `
                  <option value="${c.id}" ${c.id === preSelectedCustomerId ? 'selected' : ''}>
                    ${c.fullName} (${c.phone}) - Outstanding: ${formatCurrency(c.totalOutstanding)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group full-width">
              <label class="form-label" for="plan-product">Select Product (Optional)</label>
              <select id="plan-product" class="form-control">
                <option value="">-- No Product / Custom Amount --</option>
                ${products.map(p => `
                  <option value="${p.id}" data-price="${p.price}">
                    ${p.name} - Price: ${formatCurrency(p.price)}
                  </option>
                `).join('')}
              </select>
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
              <label class="form-label" for="plan-purchase-cost">Actual Purchase Cost <span class="required">*</span></label>
              <input type="number" id="plan-purchase-cost" class="form-control" required min="0" placeholder="e.g. 45000"/>
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
              <span class="info-label">Cost Gap:</span>
              <span class="info-value" id="summary-cost-gap">PKR 0</span>
            </div>
            <div class="info-row">
              <span class="info-label">Markup Amount:</span>
              <span class="info-value" id="summary-markup">PKR 0</span>
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

  // Set default start date to today
  document.getElementById('plan-startdate').value = new Date().toISOString().split('T')[0];

  const step1Cont = document.getElementById('step-1-content');
  const step2Cont = document.getElementById('step-2-content');
  const step1Ind  = document.getElementById('step-1-indicator');
  const step2Ind  = document.getElementById('step-2-indicator');

  const prodSelect = document.getElementById('plan-product');
  const principalInput = document.getElementById('plan-principal');

  // Product selection fills price
  prodSelect.addEventListener('change', () => {
    const selectedOption = prodSelect.options[prodSelect.selectedIndex];
    const price = selectedOption.dataset.price;
    if (price) {
      principalInput.value = price;
      recalculate();
    }
  });

  // Financial inputs listener
  ['plan-principal', 'plan-purchase-cost', 'plan-downpayment', 'plan-markup', 'plan-installment-amount'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', recalculate);
  });

  // Navigation Logic
  document.getElementById('btn-next-step')?.addEventListener('click', () => {
    const custVal = document.getElementById('plan-customer').value;
    if (!custVal) {
      Toast.warning('Validation', 'Please select a customer first.');
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
    const productId = document.getElementById('plan-product').value;
    const principalAmount = parseFloat(principalInput.value);
    const purchaseCost = parseFloat(document.getElementById('plan-purchase-cost').value) || 0;
    const downPayment = parseFloat(document.getElementById('plan-downpayment').value) || 0;
    const markupRate = parseFloat(document.getElementById('plan-markup').value) || 0;
    const installmentAmount = parseFloat(document.getElementById('plan-installment-amount').value);
    const frequency = document.getElementById('plan-frequency').value;
    const startDate = document.getElementById('plan-startdate').value;

    if (purchaseCost > principalAmount) {
      Toast.warning('Validation error', 'Purchase cost cannot exceed invoice / sale price.');
      return;
    }

    if (isNaN(installmentAmount) || installmentAmount <= 0) {
      Toast.warning('Validation error', 'Installment amount must be greater than 0.');
      return;
    }

    const netFinanced = Math.max(principalAmount - downPayment, 0);
    const totalMarkup = Number((principalAmount * (markupRate / 100)).toFixed(2));
    const totalPayable = Number((netFinanced + totalMarkup).toFixed(2));

    if (installmentAmount > totalPayable) {
      Toast.warning('Validation error', 'Installment amount cannot be greater than total amount.');
      return;
    }

    btn.classList.add('loading');
    btn.textContent = '';

    const result = await InstallmentsService.createPlan({
      customerId,
      productId: productId || null,
      principalAmount,
      purchaseCost,
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
    const downPayment = parseFloat(document.getElementById('plan-downpayment').value) || 0;
    const markupPercent = parseFloat(document.getElementById('plan-markup').value) || 0;
    const installmentAmount = parseFloat(document.getElementById('plan-installment-amount')?.value) || 0;

    const net = round2(Math.max(principal - downPayment, 0));
    const markup = round2(principal * (markupPercent / 100));
    const costGap = round2(principal - purchaseCost);
    const totalPayable = round2(net + markup);

    let preview = 'Enter installment amount to see plan preview.';
    if (installmentAmount > 0) {
      if (installmentAmount > totalPayable) {
        preview = 'Installment amount cannot be greater than total amount.';
      } else {
        const regularCount = Math.floor(totalPayable / installmentAmount);
        const remainder = round2(totalPayable - regularCount * installmentAmount);
        if (regularCount === 0) {
          preview = `This will create 1 installment of ${formatCurrency(totalPayable)}.`;
        } else if (remainder === 0) {
          preview = `This will create ${regularCount} installments of ${formatCurrency(installmentAmount)}.`;
        } else {
          preview = `This will create ${regularCount} installments of ${formatCurrency(installmentAmount)} and 1 final installment of ${formatCurrency(remainder)} (Total: ${regularCount + 1} installments).`;
        }
      }
    }

    document.getElementById('summary-net').textContent = formatCurrency(net);
    document.getElementById('summary-purchase-cost').textContent = formatCurrency(purchaseCost);
    document.getElementById('summary-cost-gap').textContent = formatCurrency(costGap);
    document.getElementById('summary-markup').textContent = formatCurrency(markup);
    document.getElementById('summary-installment').textContent = installmentAmount > 0 ? formatCurrency(installmentAmount) : 'PKR 0';
    document.getElementById('summary-preview').textContent = preview;
  }
}
