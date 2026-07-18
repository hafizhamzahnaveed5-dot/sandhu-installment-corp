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
        <p>Your account details and security settings</p>
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

      <h4 style="margin-bottom:12px;border-bottom:1px solid var(--color-border);padding-bottom:8px">Permissions</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:32px">
        ${user?.permissions.map(p => `<span class="badge badge-nodot" style="background:var(--color-bg-secondary);border:1px solid var(--color-border)">${p}</span>`).join('')}
      </div>
      
      <h4 style="margin-bottom:12px;border-bottom:1px solid var(--color-border);padding-bottom:8px">Security</h4>
      <form id="change-password-form" style="display:flex;flex-direction:column;gap:16px">
        <div id="pw-error" class="alert alert-danger" style="display:none"></div>
        <div id="pw-success" class="alert alert-success" style="display:none"></div>
        
        <div class="form-group">
          <label class="form-label">Current Password</label>
          <input type="password" id="current-password" class="form-control" required>
        </div>
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input type="password" id="new-password" class="form-control" required minlength="8">
          <small class="form-help">Minimum 8 characters</small>
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input type="password" id="confirm-password" class="form-control" required minlength="8">
        </div>
        <div>
          <button type="submit" class="btn btn-primary" id="pw-submit-btn">Update Password</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('pw-submit-btn');
    const err = document.getElementById('pw-error');
    const succ = document.getElementById('pw-success');
    
    err.style.display = 'none';
    succ.style.display = 'none';
    
    const current = document.getElementById('current-password').value;
    const newPw = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    
    if (newPw !== confirm) {
      err.textContent = 'New passwords do not match.';
      err.style.display = 'block';
      return;
    }
    
    if (newPw.length < 8) {
      err.textContent = 'New password must be at least 8 characters long.';
      err.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Updating...';
    
    const res = await AuthService.changePassword(current, newPw);
    
    btn.disabled = false;
    btn.textContent = 'Update Password';
    
    if (res.success) {
      succ.textContent = 'Password updated successfully.';
      succ.style.display = 'block';
      e.target.reset();
    } else {
      err.textContent = res.error || 'Failed to update password.';
      err.style.display = 'block';
    }
  });
}
