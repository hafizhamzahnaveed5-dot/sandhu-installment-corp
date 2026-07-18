/**
 * 404.js — 404 Screen
 */

import { renderNavbar } from '../components/navbar.js';
import { Icon } from '../components/icons.js';

export default async function init() {
  renderNavbar('404 Not Found', 'The requested page does not exist.');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="empty-state">
      ${Icon('search', 56)}
      <h1 style="font-size:36px;margin-bottom:8px">404 - Page Not Found</h1>
      <p style="margin-bottom:24px">We couldn't locate the route or view you are looking for.</p>
      <a href="#/dashboard" class="btn btn-primary">Return to Dashboard</a>
    </div>
  `;
}
