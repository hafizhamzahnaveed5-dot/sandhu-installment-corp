/**
 * settings.js — Owner web settings (business profile + theme)
 */

import { renderNavbar } from '../components/navbar.js';
import Toast from '../components/toast.js';
import AuthService from '../services/auth.service.js';
import SiteService from '../services/site.service.js';
import { Config } from '../config.js';

export default async function init() {
  renderNavbar('Web Settings', 'Business profile and site preferences');
  const content = document.getElementById('page-content');
  const isAdmin = AuthService.isAdmin();
  const currentTheme = document.documentElement.dataset.theme || 'light';

  content.innerHTML = `<div class="skeleton" style="height:320px;border-radius:var(--radius-md)"></div>`;
  const settings = await SiteService.load(true);
  const biz = { ...Config.BUSINESS, ...(settings.business || {}) };

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Web Settings</h1>
        <p>Configure how your business appears across receipts, support, and the app shell.</p>
      </div>
      <div class="page-header-actions">
        <a href="#/web-content" class="btn btn-secondary">Web Content →</a>
      </div>
    </div>

    <div class="content-grid" style="grid-template-columns:1.2fr 0.8fr">
      <div class="card">
        <div class="card-header"><h4>Business Profile</h4></div>
        <div class="form-grid">
          <div class="form-group full-width">
            <label class="form-label">Business Name</label>
            <input id="set-name" class="form-control" value="${escape(biz.name || biz.NAME || Config.BUSINESS.NAME)}" ${isAdmin ? '' : 'disabled'}>
          </div>
          <div class="form-group full-width">
            <label class="form-label">Tagline</label>
            <input id="set-tagline" class="form-control" value="${escape(biz.tagline || Config.BUSINESS.TAGLINE)}" ${isAdmin ? '' : 'disabled'}>
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input id="set-phone" class="form-control" value="${escape(biz.phone || Config.BUSINESS.PHONE)}" ${isAdmin ? '' : 'disabled'}>
          </div>
          <div class="form-group">
            <label class="form-label">WhatsApp (digits only)</label>
            <input id="set-whatsapp" class="form-control" value="${escape(biz.whatsapp || Config.BUSINESS.WHATSAPP_NUMBER)}" ${isAdmin ? '' : 'disabled'}>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input id="set-email" class="form-control" value="${escape(biz.email || Config.BUSINESS.EMAIL)}" ${isAdmin ? '' : 'disabled'}>
          </div>
          <div class="form-group">
            <label class="form-label">Currency</label>
            <input id="set-currency" class="form-control" value="${escape(biz.currency || Config.BUSINESS.CURRENCY)}" ${isAdmin ? '' : 'disabled'}>
          </div>
          <div class="form-group full-width">
            <label class="form-label">Address</label>
            <input id="set-address" class="form-control" value="${escape(biz.address || Config.BUSINESS.ADDRESS)}" ${isAdmin ? '' : 'disabled'}>
          </div>
        </div>
        ${isAdmin ? `
          <div style="margin-top:20px;display:flex;gap:10px">
            <button class="btn btn-primary" id="save-business-btn">Save Business Settings</button>
          </div>
        ` : `<p class="secondary" style="margin-top:16px">Only the owner/admin can edit business settings.</p>`}
      </div>

      <div class="card">
        <div class="card-header"><h4>Display</h4></div>
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">UI Theme</label>
          <select id="settings-theme" class="form-control">
            <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Professional Light</option>
            <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Professional Dark</option>
          </select>
        </div>
        <button class="btn btn-secondary" id="save-theme-btn">Save Theme</button>
        <hr style="border:none;border-top:1px solid var(--color-border);margin:24px 0">
        <div class="info-row"><span class="info-label">API</span><span class="info-value" style="font-size:12px;word-break:break-all">${Config.API_BASE_URL}</span></div>
        <div class="info-row"><span class="info-label">Mode</span><span class="info-value">${Config.FEATURE_FLAGS.MOCK_MODE ? 'Mock' : 'Live'}</span></div>
        ${isAdmin ? `
          <div style="margin-top:20px;display:flex;flex-direction:column;gap:8px">
            <a class="btn btn-ghost" href="#/users">Manage Staff Users</a>
            <a class="btn btn-ghost" href="#/audit-logs">Audit Logs</a>
            <a class="btn btn-ghost" href="#/web-content">Edit Web Content</a>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById('save-theme-btn')?.addEventListener('click', () => {
    const selectedTheme = document.getElementById('settings-theme').value;
    document.documentElement.dataset.theme = selectedTheme;
    localStorage.setItem('sic_theme', selectedTheme);
    Toast.success('Theme saved', 'Display theme updated.');
  });

  document.getElementById('save-business-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('save-business-btn');
    btn.classList.add('loading');
    const payload = {
      name: document.getElementById('set-name').value.trim(),
      tagline: document.getElementById('set-tagline').value.trim(),
      phone: document.getElementById('set-phone').value.trim(),
      whatsapp: document.getElementById('set-whatsapp').value.trim().replace(/[^\d]/g, ''),
      email: document.getElementById('set-email').value.trim(),
      address: document.getElementById('set-address').value.trim(),
      currency: document.getElementById('set-currency').value.trim() || 'PKR',
    };
    const res = await SiteService.save('business', payload);
    btn.classList.remove('loading');
    if (res.success) Toast.success('Saved', 'Business settings updated for the whole site.');
    else Toast.error('Save failed', res.error || 'Could not save settings. Run migration 012 if this is a new feature.');
  });
}

function escape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
