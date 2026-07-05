/**
 * settings.js — Settings configurations
 */

import { renderNavbar } from '../components/navbar.js';
import Toast from '../components/toast.js';
import { Config } from '../config.js';

export default async function init() {
  renderNavbar('Settings', 'App configuration settings');

  const content = document.getElementById('page-content');
  const currentTheme = document.documentElement.dataset.theme;

  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Settings</h1>
        <p>Application configurations</p>
      </div>
    </div>

    <div class="card" style="max-width:600px">
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">Active UI Theme Mode</label>
        <select id="settings-theme" class="form-control">
          <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Premium Dark Fintech</option>
          <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Clean Light Mode</option>
        </select>
      </div>

      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">Business Name</label>
        <input type="text" class="form-control" value="${Config.BUSINESS.NAME}" disabled readonly/>
      </div>

      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">Currency Symbol</label>
        <input type="text" class="form-control" value="${Config.BUSINESS.CURRENCY}" disabled readonly/>
      </div>

      <button class="btn btn-primary" id="save-settings-btn">Save Configurations</button>
    </div>
  `;

  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const selectedTheme = document.getElementById('settings-theme').value;
    document.documentElement.dataset.theme = selectedTheme;
    localStorage.setItem('sic_theme', selectedTheme);
    Toast.success('Settings Saved', 'Theme preferences have been successfully updated.');
  });
}
