/**
 * notifications.js — Global notifications tray log page
 */

import { renderNavbar } from '../components/navbar.js';
import NotificationsService from '../services/notifications.service.js';
import { formatDate } from '../config.js';

export default async function init() {
  renderNavbar('Notifications', 'Historical activity notifications');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>All Notifications</h1>
        <p>Direct alert records history</p>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrapper" style="border:none;border-radius:0">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Message</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="notif-tbody">
            <tr><td colspan="3"><div class="skeleton skeleton-text"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const notifsRes = await NotificationsService.list();
  const notifs = notifsRes.data || [];
  const tbody = document.getElementById('notif-tbody');

  if (notifs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><h3>No notifications found</h3></div></td></tr>`;
    return;
  }

  tbody.innerHTML = notifs.map(n => `
    <tr>
      <td class="secondary">${formatDate(n.createdAt)}</td>
      <td style="font-weight:500">${n.message}</td>
      <td><span class="badge ${n.isRead ? 'badge-inactive' : 'badge-paid'} badge-nodot">${n.isRead ? 'READ' : 'NEW'}</span></td>
    </tr>
  `).join('');
}
