/**
 * audit-logs.js — Audit logs visualization page
 */

import { renderNavbar } from '../components/navbar.js';
import AuditService from '../services/audit.service.js';
import { formatDate } from '../config.js';

export default async function init() {
  renderNavbar('Audit Logs', 'Activity history');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Audit Logs</h1>
        <p>A record of every create, update, and delete action</p>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrapper" style="border:none;border-radius:0">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Category</th>
              <th>Record ID</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="audit-tbody">
            <tr><td colspan="5"><div class="skeleton skeleton-text"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const logsRes = await AuditService.list();
  const logs = logsRes.data || [];
  const tbody = document.getElementById('audit-tbody');

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>No audit records logged</h3></div></td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td class="secondary mono" style="font-size:12px">${new Date(l.timestamp).toLocaleString()}</td>
      <td><span class="badge badge-nodot ${l.action === 'CREATE' ? 'badge-success' : 'badge-info'}">${l.action}</span></td>
      <td class="secondary">${l.entityType}</td>
      <td class="mono font-semibold">${l.entityId}</td>
      <td style="font-size:13px">${l.details}</td>
    </tr>
  `).join('');
}
