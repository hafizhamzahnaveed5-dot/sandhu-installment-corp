import { renderNavbar } from '../components/navbar.js';
import { formatCurrency, formatDate } from '../config.js';
import Toast from '../components/toast.js';
import Modal from '../components/modal.js';
import AuthService from '../services/auth.service.js';
import { api } from '../services/api.js';

let activeModal = null;

export default async function init() {
  const user = AuthService.getUser();
  if (!user) { window.location.hash = '#/login'; return; }
  if (user.role === 'customer') { window.location.hash = '#/customer-dashboard'; return; }

  renderNavbar('Roznamcha', 'Daily ledger and expenses');

  const content = document.getElementById('page-content');
  content.innerHTML = renderShell();
  bindEvents();
  await loadRoznamcha();
}

function todayLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDateInputValue(value) {
  if (!value) return todayLocal();
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : todayLocal();
}

/** Prefer account-based plan id in description text when available. */
function formatRoznamchaDescription(entry) {
  let text = String(entry.description || '');
  const planId = entry.planDisplayId || entry.referencePlanId;
  if (planId) {
    // Replace any leftover plan-{uuid} fragment if description wasn't rewritten
    text = text.replace(/plan-[0-9a-f-]{20,}/gi, planId);
  }
  return text;
}

function renderShell() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Roznamcha</h1>
        <p>Daily business ledger with purchases and expenses</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="add-entry-btn">Add Entry</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--space-6)">
      <div class="card-header">
        <h4>Summary</h4>
      </div>
      <div class="kpi-grid" id="roz-summary-grid">
        <div class="stat-card"><div class="stat-value" id="roz-purchase-total">Loading...</div><div class="stat-label">Purchases</div></div>
        <div class="stat-card"><div class="stat-value" id="roz-expense-total">Loading...</div><div class="stat-label">Expenses</div></div>
        <div class="stat-card"><div class="stat-value" id="roz-payment-total">Loading...</div><div class="stat-label">Payments Received</div></div>
        <div class="stat-card"><div class="stat-value" id="roz-outstanding-total">Loading...</div><div class="stat-label">Outstanding Balance</div></div>
        <div class="stat-card"><div class="stat-value" id="roz-net-total">Loading...</div><div class="stat-label">Net Cash Flow</div></div>
      </div>
      <div id="roz-summary-note" class="secondary" style="margin-top:8px"></div>
    </div>

    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <h4>Ledger Entries</h4>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <label style="display:flex;flex-direction:column;font-size:12px;color:var(--color-text-secondary)">
            <span>From</span>
            <input type="date" id="filter-from" class="form-control" style="min-width:140px">
          </label>
          <label style="display:flex;flex-direction:column;font-size:12px;color:var(--color-text-secondary)">
            <span>To</span>
            <input type="date" id="filter-to" class="form-control" style="min-width:140px">
          </label>
          <label style="display:flex;flex-direction:column;font-size:12px;color:var(--color-text-secondary)">
            <span>Type</span>
            <select id="filter-type" class="form-control" style="min-width:140px">
              <option value="all">All</option>
              <option value="purchase">Purchases</option>
              <option value="expense">Expenses</option>
              <option value="payment_received">Payments Received</option>
            </select>
          </label>
          <button class="btn btn-ghost" id="apply-filter-btn">Apply</button>
          <button class="btn btn-secondary" id="clear-filter-btn">Clear</button>
        </div>
      </div>

      <div id="roz-entry-list"></div>
    </div>
  `;
}

function bindEvents() {
  document.getElementById('add-entry-btn')?.addEventListener('click', () => {
    openEntryModal();
  });
  document.getElementById('apply-filter-btn')?.addEventListener('click', () => loadRoznamcha());
  document.getElementById('clear-filter-btn')?.addEventListener('click', () => {
    const from = document.getElementById('filter-from');
    const to = document.getElementById('filter-to');
    const type = document.getElementById('filter-type');
    if (from) from.value = '';
    if (to) to.value = '';
    if (type) type.value = 'all';
    // Keep dd-mm-yyyy display fields in sync if date-input enhancer is active
    from?.dispatchEvent(new Event('change', { bubbles: true }));
    to?.dispatchEvent(new Event('change', { bubbles: true }));
    loadRoznamcha();
  });
  document.getElementById('filter-from')?.addEventListener('change', () => loadRoznamcha());
  document.getElementById('filter-to')?.addEventListener('change', () => loadRoznamcha());
  document.getElementById('filter-type')?.addEventListener('change', () => loadRoznamcha());
  document.getElementById('roz-entry-list')?.addEventListener('click', handleEntryActions);
}

function openEntryModal(entry = null) {
  if (activeModal) {
    activeModal.destroy();
    activeModal = null;
  }

  const isEdit = Boolean(entry?.id);
  const formHtml = `
    <form id="roz-entry-form" class="form-grid" style="grid-template-columns:1fr">
      <input type="hidden" id="entry-id" value="${entry?.id || ''}">
      <div class="form-group">
        <label class="form-label" for="entry-date">Date</label>
        <input type="date" id="entry-date" class="form-control" required value="${toDateInputValue(entry?.entryDate)}">
      </div>
      <div class="form-group">
        <label class="form-label" for="entry-description">Description</label>
        <input type="text" id="entry-description" class="form-control" required placeholder="e.g. Chai and lunch" value="${escapeAttr(entry?.description || '')}">
      </div>
      <div class="form-group">
        <label class="form-label" for="entry-amount">Amount</label>
        <input type="number" id="entry-amount" class="form-control" min="0.01" step="0.01" required value="${entry?.amount ?? ''}">
      </div>
    </form>
  `;

  activeModal = Modal.create({
    title: isEdit ? 'Edit Expense Entry' : 'Add Expense Entry',
    content: formHtml,
    footer: `
      <button type="button" class="btn btn-ghost" id="cancel-entry-btn">Cancel</button>
      <button type="submit" form="roz-entry-form" class="btn btn-primary" id="save-entry-btn">Save Entry</button>
    `,
    onClose: () => { activeModal = null; },
  });

  activeModal.open();

  activeModal.backdrop.querySelector('#cancel-entry-btn')?.addEventListener('click', () => {
    activeModal?.destroy();
    activeModal = null;
  });

  activeModal.backdrop.querySelector('#roz-entry-form')?.addEventListener('submit', handleCreate);
}

function escapeAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function handleEntryActions(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!id) return;

  if (action === 'edit') {
    const entry = (await api.get('/roznamcha')).data?.find((item) => item.id === id);
    if (entry) openEntryModal(entry);
    return;
  }

  if (action === 'delete') {
    const confirmed = await Modal.confirm('Delete this entry?', 'This manual Roznamcha expense will be removed permanently.');
    if (!confirmed) return;
    const res = await api.delete(`/roznamcha/${id}`);
    if (!res.success) {
      Toast.error('Delete failed', res.error || 'Please try again.');
      return;
    }
    Toast.success('Entry deleted', 'The manual entry was removed.');
    await loadRoznamcha();
  }
}

async function handleCreate(event) {
  event.preventDefault();
  const entryId = document.getElementById('entry-id')?.value || '';
  const date = document.getElementById('entry-date')?.value;
  const description = document.getElementById('entry-description')?.value?.trim();
  const amount = document.getElementById('entry-amount')?.value;

  if (!date || !description || !amount) {
    Toast.error('Missing fields', 'Date, description, and amount are required.');
    return;
  }

  const saveBtn = document.getElementById('save-entry-btn');
  if (saveBtn) saveBtn.classList.add('loading');

  const payload = { date, description, amount, type: 'expense' };
  const res = entryId
    ? await api.put(`/roznamcha/${entryId}`, payload)
    : await api.post('/roznamcha', payload);

  if (saveBtn) saveBtn.classList.remove('loading');

  if (!res.success) {
    Toast.error('Unable to save entry', res.error || 'Please try again.');
    return;
  }

  Toast.success(entryId ? 'Entry updated' : 'Entry saved', entryId ? 'The expense entry was updated.' : 'The expense entry was added to Roznamcha.');
  activeModal?.destroy();
  activeModal = null;
  await loadRoznamcha();
}

async function loadRoznamcha() {
  const from = document.getElementById('filter-from')?.value || '';
  const to = document.getElementById('filter-to')?.value || '';
  const type = document.getElementById('filter-type')?.value || 'all';

  try {
    const [entriesRes, summaryRes] = await Promise.all([
      api.get('/roznamcha', { from, to, type }),
      api.get('/roznamcha/summary', { from, to }),
    ]);

    if (entriesRes.success) renderEntries(entriesRes.data || []);
    if (summaryRes.success) renderSummary(summaryRes.data, from, to);
  } catch (error) {
    console.error('[Roznamcha] Load failed:', error);
    Toast.error('Unable to load Roznamcha', error?.message || 'Please check your connection.');
    const container = document.getElementById('roz-entry-list');
    if (container) {
      container.innerHTML = `
        <div class="empty-state" style="padding:32px">
          <h3>Unable to load ledger entries</h3>
          <p>Please check your connection and try again. You can still add a manual expense entry.</p>
        </div>
      `;
    }
  }
}

function renderSummary(summary, from, to) {
  const period = summary?.period || {};
  const note = buildSummaryNote(from, to, period);

  document.getElementById('roz-purchase-total').textContent = formatCurrency(period.purchaseTotal || 0, true);
  document.getElementById('roz-expense-total').textContent = formatCurrency(period.expenseTotal || 0, true);
  document.getElementById('roz-payment-total').textContent = formatCurrency(period.paymentTotal || 0, true);

  const outstandingEl = document.getElementById('roz-outstanding-total');
  if (outstandingEl) {
    outstandingEl.textContent = formatCurrency(period.outstandingTotal || 0, true);
  }

  const netValue = Number(period.net || 0);
  const netEl = document.getElementById('roz-net-total');
  if (netEl) {
    netEl.textContent = formatCurrency(netValue, true);
    netEl.classList.toggle('text-success', netValue > 0);
    netEl.classList.toggle('text-danger', netValue < 0);
    netEl.classList.toggle('text-muted', netValue === 0);
  }

  document.getElementById('roz-summary-note').textContent = note;
}

function buildSummaryNote(from, to, period = {}) {
  const inst = Number(period.installmentPayments || 0);
  const down = Number(period.downPayments || 0);
  const parts = [];
  if (from || to) {
    if (from && to) parts.push(`Showing ${formatDate(from)} to ${formatDate(to)}`);
    else if (from) parts.push(`Showing ${formatDate(from)} to present`);
    else parts.push(`Showing up to ${formatDate(to)}`);
  } else {
    parts.push('Showing all-time totals');
  }
  parts.push(
    `Payments = installments ${formatCurrency(inst, true)} + down payments ${formatCurrency(down, true)}`
  );
  if (period.netPosition != null) {
    parts.push(`Position (cash + outstanding − outflows): ${formatCurrency(period.netPosition, true)}`);
  }
  return parts.join(' · ');
}

function renderEntries(entries) {
  const container = document.getElementById('roz-entry-list');
  if (!container) return;

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state" style="padding:32px"><h3>No ledger entries found</h3><p>Try clearing the date/type filters, or add a manual expense entry.</p></div>';
    return;
  }

  const grouped = entries.reduce((acc, entry) => {
    const date = entry.entryDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  container.innerHTML = dates.map((date) => {
    const dayEntries = grouped[date];
    const dayIn = dayEntries.filter(e => e.type === 'payment_received').reduce((s, e) => s + Number(e.amount || 0), 0);
    const dayOut = dayEntries.filter(e => e.type !== 'payment_received').reduce((s, e) => s + Number(e.amount || 0), 0);
    const dayTotal = dayIn - dayOut;
    return `
      <div class="card" style="margin-bottom:12px;padding:16px;background:var(--color-bg-elevated)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px">
          <div>
            <div style="font-weight:700">${formatDate(date)}</div>
            <div class="secondary">${dayEntries.length} entries · In: ${formatCurrency(dayIn)} · Out: ${formatCurrency(dayOut)}</div>
          </div>
          <div style="font-weight:700;color:var(--color-accent-blue)">${formatCurrency(dayTotal)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${dayEntries.map((entry) => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-bg-secondary)">
              <div>
                <div style="font-weight:600">${formatRoznamchaDescription(entry)}</div>
                <div class="secondary" style="margin-top:4px">${entry.type === 'purchase' ? 'Purchase' : (entry.type === 'expense' ? 'Expense' : 'Payment')}${(() => {
                  const planId = entry.planDisplayId || entry.referencePlanId;
                  const custId = entry.customerAccountNumber;
                  const bits = [];
                  if (custId) bits.push(`Customer ${custId}`);
                  // Avoid repeating the same ID when plan id already equals customer account
                  if (planId && planId !== custId) bits.push(`Plan ${planId}`);
                  return bits.length ? ` · ${bits.join(' · ')}` : '';
                })()}${entry.customerName ? ` · ${entry.customerName}` : ''}</div>
              </div>
              <div style="text-align:right">
                <div class="badge ${entry.type === 'purchase' ? 'badge-info' : (entry.type === 'expense' ? 'badge-danger' : 'badge-success')}">${entry.type === 'purchase' ? 'Purchase' : (entry.type === 'expense' ? 'Expense' : 'Payment')}</div>
                <div style="margin-top:6px;font-weight:700">${formatCurrency(entry.amount)}</div>
                ${!entry.referencePlanId && !entry.referencePaymentId ? `
                  <div style="margin-top:8px;display:flex;justify-content:flex-end;gap:8px">
                    <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${entry.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${entry.id}">Delete</button>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}
