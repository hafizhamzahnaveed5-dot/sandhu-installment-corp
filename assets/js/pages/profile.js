/**
 * profile.js — User profile page
 */

import { renderNavbar } from '../components/navbar.js';
import AuthService from '../services/auth.service.js';

export default async function init() {
  renderNavbar('My Profile', 'Account details and access scopes');

  const user = AuthService.getUser();
  const content = document.getElementById('page-content');

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Profile</h1>
        <p>Operational personnel card</p>
      </div>
    </div>

    <div class="card" style="max-width:600px">
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px">
        <div class="avatar avatar-lg">${user?.name.charAt(0).toUpperCase() || 'U'}</div>
        <div>
          <h2>${user?.name || 'System Operator'}</h2>
          <p>${user?.email || ''} · <span class="badge badge-info badge-nodot">${user?.role.toUpperCase()}</span></p>
        </div>
      </div>

      <h4 style="margin-bottom:12px;border-bottom:1px solid var(--color-border);padding-bottom:8px">Granted Scopes</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${user?.permissions.map(p => `<span class="badge badge-nodot" style="background:var(--color-bg-secondary);border:1px solid var(--color-border)">${p}</span>`).join('')}
      </div>
    </div>
  `;
}
