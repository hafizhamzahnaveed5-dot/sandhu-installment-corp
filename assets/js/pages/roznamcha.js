import { renderNavbar } from '../components/navbar.js';
import { formatCurrency, formatDate } from '../config.js';
import Toast from '../components/toast.js';
import AuthService from '../services/auth.service.js';
import { api } from '../services/api.js';

export default async function init() {
  const user = AuthService.getUser();
  if (!user) { window.location.hash = '#/login'; return; }
  if (user.role === 'customer') { window.location.hash = '#/customer-dashboard'; return; }

  renderNavbar('Roznamcha', 'Daily ledger and expenses');

  const content = document.getElementById('page-content');
  content.innerHTML = renderShell();
  await loadRoznamcha();
  bindEvents();
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
        </div>
      </div>

      <div id="roz-entry-list"></div>
    </div>

    <div id="entry-form-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;align-items:center;justify-content:center">
      <div style="background:var(--color-bg-elevated);border:1px solid var(--color-border);border-radius:var(--radius-lg);width:min(92vw, 480px);padding:24px;box-shadow:var(--shadow-lg)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px">
          <h3 id="entry-modal-title" style="margin:0">Add Expense Entry</h3>
          <button class="btn btn-ghost btn-icon" id="close-entry-form">✕</button>
        </div>
        <form id="roz-entry-form">
          <input type="hidden" id="entry-id">
          <label class="form-label">Date</label>
          <input type="date" id="entry-date" class="form-control" required>
          <label class="form-label">Description</label>
          <input type="text" id="entry-description" class="form-control" required placeholder="e.g. Chai and lunch">
          <label class="form-label">Amount</label>
          <input type="number" id="entry-amount" class="form-control" min="0" step="0.01" required>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">
            <button type="button" class="btn btn-ghost" id="cancel-entry-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Entry</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function bindEvents() {
  document.getElementById('add-entry-btn')?.addEventListener('click', () => {
    openEntryModal();
  });
  document.getElementById('close-entry-form')?.addEventListener('click', closeModal);
  document.getElementById('cancel-entry-btn')?.addEventListener('click', closeModal);
  document.getElementById('entry-form-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'entry-form-modal') closeModal();
  });
  document.getElementById('roz-entry-form')?.addEventListener('submit', handleCreate);
  document.getElementById('apply-filter-btn')?.addEventListener('click', () => loadRoznamcha());
  document.getElementById('roz-entry-list')?.addEventListener('click', handleEntryActions);
}

function openEntryModal(entry = null) {
  const modal = document.getElementById('entry-form-modal');
  const title = document.getElementById('entry-modal-title');
  const form = document.getElementById('roz-entry-form');
  if (modal) modal.style.display = 'flex';
  if (title) title.textContent = entry ? 'Edit Expense Entry' : 'Add Expense Entry';
  if (form) form.reset();
  document.getElementById('entry-id').value = entry?.id || '';
  document.getElementById('entry-date').value = entry?.entryDate || new Date().toISOString().slice(0, 10);
  document.getElementById('entry-description').value = entry?.description || '';
  document.getElementById('entry-amount').value = entry?.amount || '';
}

function closeModal() {
  const modal = document.getElementById('entry-form-modal');
  if (modal) modal.style.display = 'none';
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
    const confirmed = window.confirm('Delete this manual Roznamcha entry?');
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
  const entryId = document.getElementById('entry-id').value;
  const payload = {
    date: document.getElementById('entry-date').value,
    description: document.getElementById('entry-description').value,
    amount: document.getElementById('entry-amount').value,
    type: 'expense',
  };

  const res = entryId
    ? await api.put(`/roznamcha/${entryId}`, payload)
    : await api.post('/roznamcha', payload);

  if (!res.success) {
    Toast.error('Unable to save entry', res.error || 'Please try again.');
    return;
  }

  Toast.success(entryId ? 'Entry updated' : 'Entry saved', entryId ? 'The expense entry was updated.' : 'The expense entry was added to Roznamcha.');
  closeModal();
  document.getElementById('roz-entry-form').reset();
  await loadRoznamcha();
}

async function loadRoznamcha() {
  const from = document.getElementById('filter-from')?.value || '';
  const to = document.getElementById('filter-to')?.value || '';
  const type = document.getElementById('filter-type')?.value || 'all';

  const [entriesRes, summaryRes] = await Promise.all([
    api.get('/roznamcha', { from, to, type }),
    api.get('/roznamcha/summary'),
  ]);

  if (entriesRes.success) renderEntries(entriesRes.data || []);
  if (summaryRes.success) renderSummary(summaryRes.data);
}

function renderSummary(summary) {
  const period = summary?.period || {};
  document.getElementById('roz-purchase-total').textContent = formatCurrency(period.purchaseTotal || 0, true);
  document.getElementById('roz-expense-total').textContent = formatCurrency(period.expenseTotal || 0, true);
  document.getElementById('roz-payment-total').textContent = formatCurrency(period.paymentTotal || 0, true);
  document.getElementById('roz-net-total').textContent = formatCurrency(period.net || 0, true);
  document.getElementById('roz-summary-note').textContent = period.label ? `Showing ${period.label}` : 'Showing selected period';
}

function renderEntries(entries) {
  const container = document.getElementById('roz-entry-list');
  if (!container) return;

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state" style="padding:32px"><h3>No ledger entries found</h3><p>Try a different date range or add your first expense entry.</p></div>';
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
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-bg)">
              <div>
                <div style="font-weight:600">${entry.description}</div>
                <div class="secondary" style="margin-top:4px">${entry.type === 'purchase' ? 'Purchase' : (entry.type === 'expense' ? 'Expense' : 'Payment')}${entry.referencePlanId ? ` · Plan ${entry.referencePlanId}` : ''}</div>
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
