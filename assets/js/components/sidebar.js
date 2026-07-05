/**
 * sidebar.js — Sidebar component
 * Renders nav items, handles collapse/expand, active state, mobile overlay.
 */

import AuthService from '../services/auth.service.js';
import NotificationsService from '../services/notifications.service.js';
import { Config } from '../config.js';

const NAV_ITEMS = [
  {
    section: 'Main',
    items: [
      { route: 'dashboard',   label: 'Dashboard',    icon: iconDashboard() },
      { route: 'customers',   label: 'Customers',    icon: iconCustomers() },
      { route: 'installments',label: 'Installments', icon: iconInstallments() },
      { route: 'payments',    label: 'Payments',     icon: iconPayments() },
    ],
  },
  {
    section: 'Business',
    items: [
      { route: 'products',    label: 'Products',     icon: iconProducts() },
      { route: 'reports',     label: 'Reports',      icon: iconReports() },
      { route: 'analytics',   label: 'Analytics',    icon: iconAnalytics() },
    ],
  },
  {
    section: 'Admin',
    items: [
      { route: 'users',       label: 'Users',        icon: iconUsers(), adminOnly: true },
      { route: 'audit-logs',  label: 'Audit Logs',   icon: iconAudit(), adminOnly: true },
      { route: 'settings',    label: 'Settings',     icon: iconSettings() },
    ],
  },
];

export function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const user = AuthService.getUser();
  const isAdmin    = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';
  const unreadCount = NotificationsService.getUnreadCount();

  // Customers only see their own dashboard link
  const navSections = isCustomer ? [
    {
      section: 'My Account',
      items: [
        { route: 'customer-dashboard', label: 'My Plan',   icon: iconInstallments() },
        { route: 'profile',            label: 'Profile',   icon: iconSettings() },
      ],
    },
  ] : NAV_ITEMS;

  sidebar.innerHTML = `
    <a class="sidebar-logo" href="#/dashboard" data-route="dashboard">
      <div class="sidebar-logo-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </div>
      <div class="sidebar-logo-text">
        <div class="sidebar-logo-name">Sandhu IC</div>
        <div class="sidebar-logo-tagline">Smart Installments</div>
      </div>
    </a>

    <nav class="sidebar-nav" id="sidebar-nav">
      ${navSections.map(section => `
        <div class="nav-section-label">${section.section}</div>
        ${section.items.filter(item => !item.adminOnly || isAdmin).map(item => `
          <a class="nav-item"
             href="#/${item.route}"
             data-route="${item.route}"
             data-tooltip="${item.label}"
             id="nav-${item.route}">
            ${item.icon}
            <span class="nav-label">${item.label}</span>
            ${item.route === 'notifications' && unreadCount > 0 
              ? `<span class="nav-badge">${unreadCount}</span>` : ''}
          </a>
        `).join('')}
      `).join('')}
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user" id="sidebar-user-btn">
        <div class="avatar avatar-sm" style="background:var(--color-accent-blue-dim);color:var(--color-accent-blue)">
          ${user ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${user?.name || 'User'}</div>
          <div class="sidebar-user-role">${user?.role || ''}</div>
        </div>
      </div>
    </div>
  `;

  // User menu — quick popup (no dynamic import needed)
  sidebar.querySelector('#sidebar-user-btn')?.addEventListener('click', () => {
    // Quick logout/profile dropdown
    const menu = document.createElement('div');
    menu.style.cssText = `
      position:fixed; bottom:80px; left:${sidebar.classList.contains('collapsed') ? '80px' : '270px'};
      background:var(--color-bg-glass); backdrop-filter:var(--backdrop-blur);
      border:1px solid var(--color-border-strong); border-radius:var(--radius-md);
      box-shadow:var(--shadow-lg); z-index:var(--z-dropdown); overflow:hidden; min-width:180px;
    `;
    menu.innerHTML = `
      <a class="dropdown-item" href="#/profile" style="display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:14px;color:var(--color-text-secondary);text-decoration:none;transition:all 0.15s;cursor:pointer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Profile
      </a>
      <div style="height:1px;background:var(--color-border)"></div>
      <div id="quick-logout" class="dropdown-item" style="display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:14px;color:var(--color-accent-red);cursor:pointer;transition:all 0.15s">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Logout
      </div>
    `;
    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', () => menu.remove(), { once: true });
    }, 10);
    menu.querySelector('#quick-logout').addEventListener('click', () => {
      AuthService.logout();
      window.location.hash = '/login';
      menu.remove();
    });
  });
}

export function setActiveNav(route) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
}

// ── SVG icons ─────────────────────────────────────────────────
function iconDashboard() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
}
function iconCustomers() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
}
function iconInstallments() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
}
function iconPayments() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`;
}
function iconProducts() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`;
}
function iconReports() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
}
function iconAnalytics() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
}
function iconUsers() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
}
function iconAudit() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
}
function iconSettings() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
}
