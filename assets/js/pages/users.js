/**
 * users.js — Staff user management page (Admin only)
 *
 * Lists all system users and allows Super Admin to create new users
 * with a role selector (Admin, Manager, Agent, Customer).
 */

import { renderNavbar } from '../components/navbar.js';
import AuthService from '../services/auth.service.js';
import Modal from '../components/modal.js';
import Toast from '../components/toast.js';
import { attachSearch } from '../components/search.js';
import { formatDate, getInitials } from '../config.js';
import CustomersService from '../services/customers.service.js';
import { Icon } from '../components/icons.js';

let _allUsers = [];
let _searchHandle = null;

export default async function init() {
  // Guard: admin only
  if (!AuthService.isAdmin()) {
    document.getElementById('page-content').innerHTML = `
      <div class="empty-state">
        ${Icon('lock', 48)}
        <h2>Access Restricted</h2>
        <p>Only Super Admin accounts can manage staff users.</p>
        <a href="#/dashboard" class="btn btn-primary mt-4">Back to Dashboard</a>
      </div>
    `;
    return;
  }

  renderNavbar('Staff Users', 'Manage system accounts');

  await loadAndRender();
}

async function loadAndRender() {
  const content = document.getElementById('page-content');

  // Skeleton while loading
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Staff Users</h1>
        <p>All system accounts — staff, managers, and customers</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="create-user-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create User
        </button>
      </div>
    </div>

    <!-- Search & filter bar -->
    <div class="filter-bar" style="margin-bottom:var(--space-4)">
      <div class="search-input" style="flex:1;max-width:360px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="users-search" type="text" placeholder="Search by name or email…">
      </div>
      <select id="users-role-filter" class="form-control" style="width:auto">
        <option value="">All roles</option>
        <option value="admin">Admin</option>
        <option value="manager">Manager</option>
        <option value="agent">Agent</option>
        <option value="customer">Customer</option>
      </select>
    </div>

    <!-- Table container -->
    <div class="card" style="padding:0">
      <div id="users-table-container">
        <div class="skeleton" style="height:240px;border-radius:var(--radius-md)"></div>
      </div>
    </div>
  `;

  // Load users
  const result = await AuthService.listUsers();
  if (!result.success) {
    document.getElementById('users-table-container').innerHTML = `
      <div class="alert alert-danger" style="margin:24px">Failed to load users: ${result.error}</div>
    `;
    return;
  }

  _allUsers = result.data;
  renderTable(_allUsers);

  // Wire search
  if (_searchHandle) _searchHandle.destroy();
  _searchHandle = attachSearch('users-search', _allUsers, ['name', 'email', 'role'], renderTable);

  // Role filter
  document.getElementById('users-role-filter')?.addEventListener('change', e => {
    const role = e.target.value;
    const q = document.getElementById('users-search')?.value || '';
    let filtered = _searchHandle.filter(q);
    if (role) filtered = filtered.filter(u => u.role === role);
    renderTable(filtered);
  });

  // Create user button
  document.getElementById('create-user-btn')?.addEventListener('click', openCreateModal);
}

// ── Render table ──────────────────────────────────────────────────────────────
function renderTable(users) {
  const container = document.getElementById('users-table-container');
  if (!container) return;

  if (!users.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:48px">
        ${Icon('user', 44)}
        <h3>No users found</h3>
        <p>Try adjusting your search or filters.</p>
      </div>
    `;
    return;
  }

  const ROLE_BADGE = {
    admin:    'badge-info',
    manager:  'badge-active',
    agent:    'badge-due-soon',
    customer: 'badge-inactive',
  };

  container.innerHTML = `
    <div class="table-wrapper" style="border:none;border-radius:0">
      <table class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="avatar avatar-sm" style="background:var(--color-accent-blue-dim);color:var(--color-accent-blue)">
                    ${getInitials(u.name)}
                  </div>
                  <div>
                    <div style="font-weight:500">${u.name}</div>
                    <div style="font-size:11px;color:var(--color-text-tertiary)">#${u.id}</div>
                  </div>
                </div>
              </td>
              <td class="secondary">${u.email}</td>
              <td>
                <span class="badge ${ROLE_BADGE[u.role] || 'badge-info'} badge-nodot" style="text-transform:capitalize">
                  ${u.role}
                </span>
              </td>
              <td>
                <span class="badge badge-${u.status === 'active' ? 'active' : 'inactive'} badge-nodot">
                  ${u.status}
                </span>
              </td>
              <td class="secondary">${u.lastLogin ? formatDate(u.lastLogin) : 'Never'}</td>
              <td style="text-align:right">
                <button class="btn btn-ghost btn-sm edit-user-btn" data-id="${u.id}">Edit</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:12px 20px;border-top:1px solid var(--color-border);font-size:13px;color:var(--color-text-tertiary)">
      ${users.length} user${users.length !== 1 ? 's' : ''}
    </div>
  `;

  document.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = _allUsers.find(u => u.id === btn.dataset.id);
      if (user) openEditModal(user);
    });
  });
}

// ── Create User Modal ─────────────────────────────────────────────────────────
async function openCreateModal() {
  const customersRes = await CustomersService.list({ pageSize: 1000 });
  const customersList = customersRes.success ? customersRes.data : [];

  const formHtml = `
    <div class="form-grid">
      <div class="form-group full-width">
        <label class="form-label" for="cu-name">Full Name <span class="required">*</span></label>
        <input type="text" id="cu-name" class="form-control" placeholder="e.g. Hamza Ahmed" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="cu-email">Email Address <span class="required">*</span></label>
        <input type="email" id="cu-email" class="form-control" placeholder="name@company.com" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="cu-role">Role <span class="required">*</span></label>
        <select id="cu-role" class="form-control">
          <option value="agent">Agent — Installments & Payments</option>
          <option value="manager">Manager — Operational access</option>
          <option value="admin">Super Admin — Full access</option>
          <option value="customer">Customer — Self-service only</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="cu-password">Temporary Password <span class="required">*</span></label>
        <input type="text" id="cu-password" class="form-control" placeholder="min 8 characters" value="changeme123">
        <span class="form-help">User should change this on first login.</span>
      </div>

      <!-- Linked Customer (Hidden by default) -->
      <div class="form-group full-width" id="cu-customer-group" style="display:none">
        <label class="form-label" for="cu-customer">Linked Customer Record <span class="required">*</span></label>
        <select id="cu-customer" class="form-control">
          <option value="">-- Select a Customer --</option>
          ${customersList.map(c => `<option value="${c.id}">${c.fullName} (${c.phone})</option>`).join('')}
        </select>
        <span class="form-help">Required for customer accounts to link their dashboard data.</span>
      </div>

      <!-- Role description box -->
      <div class="full-width">
        <div id="role-desc" class="alert alert-info" style="margin-top:4px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div id="role-desc-text">Agent: Can view customers, record payments, and create installment schedules.</div>
        </div>
      </div>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="cu-cancel">Cancel</button>
    <button class="btn btn-primary" id="cu-submit">Create User</button>
  `;

  const modal = Modal.create({ title: 'Create New User', content: formHtml, footer: footerHtml });
  modal.open();

  // Role description updates
  const ROLE_DESC = {
    agent:    'Agent: Can view customers, record payments, and create installment schedules.',
    manager:  'Manager: Full operational access — customers, plans, payments, reports. Cannot manage users or view audit logs.',
    admin:    'Super Admin: Complete system access including user management, audit logs, and all settings.',
    customer: 'Customer: Self-service only — sees their own plan and payment schedule. Cannot access any other data.',
  };

  modal.backdrop.querySelector('#cu-role')?.addEventListener('change', e => {
    const role = e.target.value;
    const desc = document.getElementById('role-desc-text');
    if (desc) desc.textContent = ROLE_DESC[role] || '';

    const customerGroup = document.getElementById('cu-customer-group');
    if (customerGroup) {
      if (role === 'customer') {
        customerGroup.style.display = 'block';
      } else {
        customerGroup.style.display = 'none';
        modal.backdrop.querySelector('#cu-customer').value = '';
      }
    }
  });

  modal.backdrop.querySelector('#cu-cancel')?.addEventListener('click', modal.destroy);

  modal.backdrop.querySelector('#cu-submit')?.addEventListener('click', async () => {
    const name     = modal.backdrop.querySelector('#cu-name')?.value?.trim();
    const email    = modal.backdrop.querySelector('#cu-email')?.value?.trim();
    const role     = modal.backdrop.querySelector('#cu-role')?.value;
    const password = modal.backdrop.querySelector('#cu-password')?.value?.trim();
    const customerId = modal.backdrop.querySelector('#cu-customer')?.value;

    if (!name)  { Toast.warning('Validation', 'Name is required.'); return; }
    if (!email) { Toast.warning('Validation', 'Email is required.'); return; }
    if (!password || password.length < 8) { Toast.warning('Validation', 'Password must be at least 8 characters.'); return; }
    
    if (role === 'customer' && !customerId) {
      Toast.warning('Validation', 'A linked customer record is required for Customer roles.');
      return;
    }

    const btn = modal.backdrop.querySelector('#cu-submit');
    btn.classList.add('loading');

    const payload = { name, email, role, password };
    if (role === 'customer') {
      payload.customerId = customerId;
    }

    const result = await AuthService.createUser(payload);

    btn.classList.remove('loading');

    if (result.success) {
      Toast.success('User Created', `${name} (${role}) has been added.`);
      modal.destroy();
      // Refresh the table without a page reload
      _allUsers = [..._allUsers, { ...result.data, password: undefined }];
      renderTable(_allUsers);
      if (_searchHandle) _searchHandle.filter();
    } else {
      Toast.error('Error', result.error || 'Failed to create user.');
    }
  });
}

// ── Edit User Modal ───────────────────────────────────────────────────────────
function openEditModal(user) {
  const formHtml = `
    <div class="form-grid">
      <div class="form-group full-width">
        <label class="form-label" for="eu-name">Full Name <span class="required">*</span></label>
        <input type="text" id="eu-name" class="form-control" value="${user.name}" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="eu-email">Email Address</label>
        <input type="email" id="eu-email" class="form-control" value="${user.email}" disabled>
      </div>
      <div class="form-group">
        <label class="form-label" for="eu-role">Role <span class="required">*</span></label>
        <select id="eu-role" class="form-control" ${user.role === 'customer' ? 'disabled' : ''}>
          <option value="agent" ${user.role === 'agent' ? 'selected' : ''}>Agent — Installments & Payments</option>
          <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager — Operational access</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Super Admin — Full access</option>
          <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Customer — Self-service only</option>
        </select>
        ${user.role === 'customer' ? '<span class="form-help">Customer role cannot be changed.</span>' : ''}
      </div>
      <div class="form-group full-width">
        <label class="form-label" for="eu-status">Account Status <span class="required">*</span></label>
        <select id="eu-status" class="form-control">
          <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive (Suspended)</option>
        </select>
      </div>
    </div>
  `;

  const footerHtml = `
    <div style="flex:1">
      <button class="btn btn-ghost text-danger" id="eu-delete">Delete User</button>
    </div>
    <button class="btn btn-secondary" id="eu-cancel">Cancel</button>
    <button class="btn btn-primary" id="eu-submit">Save Changes</button>
  `;

  const modal = Modal.create({ title: 'Edit User', content: formHtml, footer: footerHtml });
  modal.open();

  modal.backdrop.querySelector('#eu-cancel')?.addEventListener('click', modal.destroy);

  // Handle Delete
  modal.backdrop.querySelector('#eu-delete')?.addEventListener('click', async () => {
    if (!confirm(`Are you sure you want to delete ${user.name} (${user.email})? This action cannot be undone.`)) return;
    
    const btn = modal.backdrop.querySelector('#eu-delete');
    btn.classList.add('loading');

    const result = await AuthService.deleteUser(user.id);
    
    if (result.success) {
      Toast.success('User Deleted', `${user.name} has been removed.`);
      modal.destroy();
      _allUsers = _allUsers.filter(u => u.id !== user.id);
      renderTable(_allUsers);
      if (_searchHandle) _searchHandle.filter();
    } else {
      btn.classList.remove('loading');
      Toast.error('Delete Failed', result.error || 'Could not delete user.');
    }
  });

  // Handle Save
  modal.backdrop.querySelector('#eu-submit')?.addEventListener('click', async () => {
    const name = modal.backdrop.querySelector('#eu-name')?.value?.trim();
    // if role is customer, the select is disabled, so we pull from user.role directly
    const role = user.role === 'customer' ? 'customer' : modal.backdrop.querySelector('#eu-role')?.value;
    const status = modal.backdrop.querySelector('#eu-status')?.value;

    if (!name) { Toast.warning('Validation', 'Name is required.'); return; }

    const btn = modal.backdrop.querySelector('#eu-submit');
    btn.classList.add('loading');

    const result = await AuthService.updateUser(user.id, { name, role, status });

    btn.classList.remove('loading');

    if (result.success) {
      Toast.success('User Updated', `${name}'s profile has been saved.`);
      modal.destroy();
      const idx = _allUsers.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        _allUsers[idx] = { ..._allUsers[idx], ...result.data };
      }
      renderTable(_allUsers);
      if (_searchHandle) _searchHandle.filter();
    } else {
      Toast.error('Update Failed', result.error || 'Could not save changes.');
    }
  });
}
