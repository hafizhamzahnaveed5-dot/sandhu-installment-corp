/**
 * web-content.js — Owner-editable website content blocks
 */

import { renderNavbar } from '../components/navbar.js';
import Toast from '../components/toast.js';
import AuthService from '../services/auth.service.js';
import SiteService from '../services/site.service.js';

export default async function init() {
  if (!AuthService.isAdmin()) {
    window.location.hash = '#/settings';
    return;
  }

  renderNavbar('Web Content', 'Announcements, support copy, receipt footer');
  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="skeleton" style="height:280px;border-radius:var(--radius-md)"></div>`;

  const settings = await SiteService.load(true);
  const wc = settings.web_content || {};

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Web Content</h1>
        <p>Control announcements and text shown across the app and receipts.</p>
      </div>
      <div class="page-header-actions">
        <a href="#/settings" class="btn btn-secondary">← Web Settings</a>
      </div>
    </div>

    <div class="card" style="max-width:760px">
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Site Announcement Banner</label>
        <textarea id="wc-announcement" class="form-control" rows="2" placeholder="Optional banner shown to staff (leave blank to hide)">${escape(wc.announcement || '')}</textarea>
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Welcome / Home Message</label>
        <input id="wc-home" class="form-control" value="${escape(wc.homeWelcome || '')}">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Support Hours</label>
        <input id="wc-hours" class="form-control" value="${escape(wc.supportHours || '')}">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Support Message</label>
        <textarea id="wc-support" class="form-control" rows="3">${escape(wc.supportMessage || '')}</textarea>
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Receipt Footer Note</label>
        <textarea id="wc-receipt" class="form-control" rows="2">${escape(wc.receiptFooter || '')}</textarea>
      </div>
      <button class="btn btn-primary" id="save-content-btn">Save Web Content</button>
    </div>
  `;

  document.getElementById('save-content-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-content-btn');
    btn.classList.add('loading');
    const payload = {
      announcement: document.getElementById('wc-announcement').value.trim(),
      homeWelcome: document.getElementById('wc-home').value.trim(),
      supportHours: document.getElementById('wc-hours').value.trim(),
      supportMessage: document.getElementById('wc-support').value.trim(),
      receiptFooter: document.getElementById('wc-receipt').value.trim(),
    };
    const res = await SiteService.save('web_content', payload);
    btn.classList.remove('loading');
    if (res.success) Toast.success('Saved', 'Web content updated.');
    else Toast.error('Save failed', res.error || 'Could not save. Ensure migration 012 is applied.');
  });
}

function escape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
