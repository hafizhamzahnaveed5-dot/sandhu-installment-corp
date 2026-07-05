/**
 * forgot-password.js — Forgot password page controller
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

      <div style="text-align:center;margin-bottom:32px">
        <div style="width:60px;height:60px;background:var(--color-accent-blue-dim);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-blue)" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 style="margin-bottom:6px">Reset password</h2>
        <p style="font-size:14px">Enter your email and we'll send you a reset link.</p>
      </div>

      <form id="forgot-form" style="display:block" autocomplete="off">
        <div class="form-group" style="margin-bottom:24px">
          <label class="form-label" for="fp-email">Email address <span class="required">*</span></label>
          <div class="input-group">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <input type="email" id="fp-email" class="form-control" placeholder="your@email.com" required/>
          </div>
        </div>
        <button type="submit" class="btn btn-primary w-full btn-lg" id="fp-btn">Send Reset Link</button>
      </form>

      <div id="fp-success" style="display:none;text-align:center">
        <div class="alert alert-success" style="justify-content:center;margin-bottom:24px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Reset link sent! Check your email inbox.</span>
        </div>
        <p style="font-size:13px;color:var(--color-text-tertiary)">Didn't receive it? Check your spam folder or try again.</p>
      </div>

      <div style="text-align:center;margin-top:24px">
        <a href="#/login" style="font-size:13px;color:var(--color-accent-blue);display:inline-flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to login
        </a>
      </div>
    </div>
  `;

  document.getElementById('forgot-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('fp-email').value;
    const btn = document.getElementById('fp-btn');
    if (!email) return;

    btn.classList.add('loading');
    btn.textContent = '';

    await AuthService.forgotPassword(email);

    btn.classList.remove('loading');
    document.getElementById('forgot-form').style.display = 'none';
    document.getElementById('fp-success').style.display = 'block';
  });
}
