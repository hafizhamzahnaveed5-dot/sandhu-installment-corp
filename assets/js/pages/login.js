/**
 * login.js — Login page controller
 */

import AuthService from '../services/auth.service.js';
import Toast from '../components/toast.js';

export default async function init() {
  const authLayout = document.getElementById('auth-layout');
  authLayout.innerHTML = `
    <div class="auth-card">
      <a class="auth-logo" href="#/login">
        <div class="auth-logo-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <div class="auth-logo-text">Sandhu Installment Corporation</div>
          <div class="auth-logo-sub">Smart Installments. Secure Future.</div>
        </div>
      </a>

      <h2 style="margin-bottom:6px">Welcome back</h2>
      <p style="margin-bottom:32px;font-size:14px">Sign in to your account to continue</p>

      <form id="login-form">
        <div class="form-group" style="margin-bottom:20px">
          <label class="form-label" for="email">Email address <span class="required">*</span></label>
          <div class="input-group">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <input type="email" id="email" class="form-control" placeholder="admin@sandhuinstallments.com"
              required autocomplete="email" value="admin@sandhuinstallments.com"/>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label" for="password">Password <span class="required">*</span></label>
          <div class="input-group">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input type="password" id="password" class="form-control" placeholder="••••••••"
              required autocomplete="current-password" value="admin123"/>
            <button type="button" id="toggle-password" class="input-suffix btn btn-ghost btn-icon" style="background:none;border:none;cursor:pointer;padding:4px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="eye-icon">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-bottom:28px">
          <a href="#/forgot-password" style="font-size:13px;color:var(--color-accent-blue)">Forgot password?</a>
        </div>

        <button type="submit" class="btn btn-primary w-full btn-lg" id="login-btn">
          Sign In
        </button>
      </form>

      <div class="alert alert-info" style="margin-top:24px;font-size:12px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span><strong>Demo credentials:</strong> admin@sandhuinstallments.com / admin123</span>
      </div>
    </div>
  `;

  // Password visibility toggle
  document.getElementById('toggle-password')?.addEventListener('click', () => {
    const pwd = document.getElementById('password');
    pwd.type = pwd.type === 'password' ? 'text' : 'password';
  });

  // Form submit
  document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
      Toast.error('Missing fields', 'Please enter email and password.');
      return;
    }

    btn.classList.add('loading');
    btn.textContent = '';

    const result = await AuthService.login(email, password);
    btn.classList.remove('loading');
    btn.textContent = 'Sign In';

    if (result.success) {
      Toast.success('Welcome back!', `Logged in as ${result.data.user.name}`);
      setTimeout(() => { window.location.hash = '/dashboard'; }, 500);
    } else {
      Toast.error('Login failed', result.error);
      document.getElementById('email').classList.add('error');
      document.getElementById('password').classList.add('error');
    }
  });
}
