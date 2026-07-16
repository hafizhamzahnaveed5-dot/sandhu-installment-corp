/**
 * navbar.js — Topbar component
 * Renders: sidebar toggle, page title, search, notifications, theme toggle
 */

import NotificationsService from '../services/notifications.service.js';
import AuthService from '../services/auth.service.js';
import { formatDate } from '../config.js';
import { initGlobalSearch } from './search.js';

export function renderNavbar(pageTitle = '', pageSubtitle = '') {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  topbar.innerHTML = `
    <div class="topbar-left">
      <button id="sidebar-toggle" aria-label="Toggle sidebar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div class="page-breadcrumb">
        <div class="page-title">${pageTitle}</div>
        ${pageSubtitle ? `<div class="page-subtitle">${pageSubtitle}</div>` : ''}
      </div>
    </div>

    <div class="topbar-right">
      <!-- Search trigger -->
      <button class="topbar-search" id="global-search-btn" aria-label="Search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="hide-mobile">Search...</span>
        <kbd class="hide-mobile">Ctrl K</kbd>
      </button>

      <!-- Notifications -->
      <div style="position:relative" id="notif-wrapper">
        <button class="topbar-notif" id="notif-toggle" aria-label="Notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span class="notif-badge" id="notif-badge" style="display:none"></span>
        </button>
        <div class="notif-panel" id="notif-panel"></div>
      </div>

      <!-- Theme toggle -->
      <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">
        <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      </button>
    </div>
  `;

  // Sidebar toggle
  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);

  // Global search (overlay with keyboard nav)
  initGlobalSearch();

  // Notifications
  loadNotifications().catch((error) => {
    console.error('Navbar notification load failed:', error);
    if (error.status === 401 || String(error.message).toLowerCase().includes('auth')) {
      AuthService.logout();
      window.location.hash = '/login';
    }
  });
  document.getElementById('notif-toggle')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('notif-panel')?.classList.toggle('open');
  });
  document.addEventListener('click', () => {
    document.getElementById('notif-panel')?.classList.remove('open');
  });

  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.dataset.theme !== 'light';
    html.dataset.theme = isDark ? 'light' : 'dark';
    localStorage.setItem('sic_theme', html.dataset.theme);
  });

}

async function loadNotifications() {
  let result;
  try {
    result = await NotificationsService.list();
  } catch (error) {
    console.error('Notification load failed:', error);
    if (error.status === 401 || error.message?.toLowerCase().includes('auth')) {
      AuthService.logout();
      window.location.hash = '/login';
      return;
    }
    return;
  }

  const notifs = result.data || [];
  const unread = notifs.filter(n => !n.isRead);

  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.style.display = unread.length > 0 ? 'block' : 'none';
  }

  const panel = document.getElementById('notif-panel');
  if (!panel) return;

  const typeIcon = {
    overdue:      `<div style="width:32px;height:32px;border-radius:50%;background:var(--color-accent-red-dim);color:var(--color-accent-red);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>`,
    'due-soon':   `<div style="width:32px;height:32px;border-radius:50%;background:var(--color-accent-amber-dim);color:var(--color-accent-amber);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>`,
    payment:      `<div style="width:32px;height:32px;border-radius:50%;background:var(--color-accent-green-dim);color:var(--color-accent-green);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>`,
    'new-customer': `<div style="width:32px;height:32px;border-radius:50%;background:var(--color-accent-blue-dim);color:var(--color-accent-blue);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`,
  };

  panel.innerHTML = `
    <div class="notif-panel-header">
      <h4 style="margin:0;font-size:14px">Notifications</h4>
      <button class="btn btn-ghost btn-sm" id="mark-all-read">Mark all read</button>
    </div>
    <div class="notif-list">
      ${notifs.length === 0 ? `<div class="empty-state" style="padding:32px"><p>No notifications</p></div>` :
        notifs.map(n => `
          <div class="notif-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}">
            ${typeIcon[n.type] || typeIcon['payment']}
            <div style="flex:1">
              <div style="font-size:13px;color:var(--color-text-primary);line-height:1.4">${n.message}</div>
              <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:3px">${formatDate(n.createdAt)}</div>
            </div>
            ${!n.isRead ? `<div class="notif-dot"></div>` : ''}
          </div>
        `).join('')
      }
    </div>
    <div style="padding:10px 16px;border-top:1px solid var(--color-border)">
      <a href="#/notifications" style="font-size:13px;color:var(--color-accent-blue)">View all notifications</a>
    </div>
  `;

  panel.querySelector('#mark-all-read')?.addEventListener('click', async e => {
    e.stopPropagation();
    await NotificationsService.markAllRead();
    loadNotifications();
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const wrapper = document.getElementById('main-wrapper');
  const isMobile = window.innerWidth <= 1024;

  if (isMobile) {
    sidebar.classList.toggle('mobile-open');
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.toggle('visible', sidebar.classList.contains('mobile-open'));
  } else {
    sidebar.classList.toggle('collapsed');
    wrapper.classList.toggle('expanded', sidebar.classList.contains('collapsed'));
    localStorage.setItem('sic_sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
  }
}
