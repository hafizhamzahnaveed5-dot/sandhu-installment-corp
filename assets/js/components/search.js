/**
 * search.js — Shared live-search utility
 *
 * Usage:
 *   import { attachSearch, initGlobalSearch } from '../components/search.js';
 *
 *   // Attach to a table/list:
 *   const handle = attachSearch('my-input-id', fullDataArray, ['fullName','phone','city'], filteredItems => {
 *     renderTable(filteredItems);
 *   });
 *   // On page teardown: handle.destroy()
 *   // To update dataset: handle.setData(newArray)
 *
 *   // Global topbar search (call once from renderNavbar):
 *   initGlobalSearch();
 */

import { debounce } from '../config.js';
import AuthService from '../services/auth.service.js';
import CustomersService from '../services/customers.service.js';
import InstallmentsService from '../services/installments.service.js';
import { Icon } from './icons.js';

/**
 * Attach a live-search handler to an existing <input> element.
 * Filters `data` by checking if ANY of `fields` contain the query string.
 *
 * @param {string}   inputId   — ID of the search <input>
 * @param {Array}    data      — full dataset to filter (not mutated)
 * @param {string[]} fields    — property names to search within each item
 * @param {Function} renderFn  — called with filtered array on each keystroke
 * @param {number}   [ms=250]  — debounce delay in ms
 * @returns {{ destroy, setData, filter }}
 */
export function attachSearch(inputId, data, fields, renderFn, ms = 250) {
  const input = document.getElementById(inputId);
  if (!input) return { destroy: () => {}, setData: () => {}, filter: () => data };

  let _data = [...data];

  function filter(query) {
    if (!query || !query.trim()) return [..._data];
    const q = query.trim().toLowerCase();
    return _data.filter(item =>
      fields.some(field => {
        const val = item[field];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }

  const handler = debounce(e => {
    renderFn(filter(e.target.value));
  }, ms);

  input.addEventListener('input', handler);

  return {
    destroy:  () => input.removeEventListener('input', handler),
    setData:  (newData) => { _data = [...newData]; renderFn(filter(input.value)); },
    filter:   (q) => filter(q),
  };
}

// ── Global search overlay ─────────────────────────────────────────────────────
let _gsOverlay   = null;
let _gsCtrlKBound = false;
let _gsSearchGen = 0;

function getNavItems() {
  const user = AuthService.getUser();
  const role = user?.role || '';
  const isAdmin = role === 'admin';
  const isCustomer = role === 'customer';

  if (isCustomer) {
    return [
      { label: 'My Plan',  subtitle: 'Your installment plan', route: 'customer-dashboard', icon: Icon('file-text'), kind: 'page' },
      { label: 'Profile',  subtitle: 'Account details',       route: 'profile',            icon: Icon('user'), kind: 'page' },
    ];
  }

  const items = [
    { label: 'Dashboard',         subtitle: 'Business overview',         route: 'dashboard',           icon: Icon('dashboard'), kind: 'page' },
    { label: 'Customers',         subtitle: 'Customer directory',         route: 'customers',           icon: Icon('customers'), kind: 'page' },
    { label: 'Installment Plans', subtitle: 'Manage all plans',           route: 'installments',        icon: Icon('file-text'), kind: 'page' },
    { label: 'New Plan',          subtitle: 'Create an installment plan', route: 'installments/create', icon: Icon('plus'), kind: 'page' },
    { label: 'Payments',          subtitle: 'Transaction ledger',         route: 'payments',            icon: Icon('credit-card'), kind: 'page' },
    { label: 'Roznamcha',         subtitle: 'Daily cash book',            route: 'roznamcha',           icon: Icon('book'), kind: 'page' },
    { label: 'Reports',           subtitle: 'Financial reports',          route: 'reports',             icon: Icon('bar-chart'), kind: 'page' },
    { label: 'Analytics',         subtitle: 'Charts & insights',          route: 'analytics',           icon: Icon('activity'), kind: 'page' },
    { label: 'Web Settings',      subtitle: 'App configuration',          route: 'settings',            icon: Icon('settings'), kind: 'page' },
  ];

  if (isAdmin) {
    items.push(
      { label: 'Staff Users',  subtitle: 'Manage staff accounts', route: 'users',       icon: Icon('user'), kind: 'page' },
      { label: 'Audit Logs',   subtitle: 'Activity trail',        route: 'audit-logs',  icon: Icon('edit'), kind: 'page' },
      { label: 'Web Content',  subtitle: 'Site content',          route: 'web-content', icon: Icon('book-open'), kind: 'page' },
    );
  }

  return items;
}

/**
 * Initialise the global search overlay.
 * IDEMPOTENT — safe to call on every page navigation (renderNavbar is called each time).
 */
export function initGlobalSearch() {
  const btn = document.getElementById('global-search-btn');
  if (!btn) return;

  btn.addEventListener('click', openSearch);

  if (!_gsCtrlKBound) {
    _gsCtrlKBound = true;
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        _gsOverlay ? closeSearch() : openSearch();
      }
    });
  }
}

function openSearch() {
  if (_gsOverlay) return;

  _gsOverlay = document.createElement('div');
  _gsOverlay.style.cssText = `
    position:fixed;inset:0;background:var(--color-bg-overlay);
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
    z-index:var(--z-modal);display:flex;align-items:flex-start;
    justify-content:center;padding-top:10vh;
  `;

  _gsOverlay.innerHTML = `
    <div style="width:100%;max-width:580px;background:var(--color-bg-glass);
      backdrop-filter:var(--backdrop-blur);-webkit-backdrop-filter:var(--backdrop-blur);
      border:1px solid var(--color-border-strong);border-radius:var(--radius-lg);
      box-shadow:var(--shadow-lg);overflow:hidden">

      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;
                  border-bottom:1px solid var(--color-border)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="var(--color-text-tertiary)" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="gs-input" type="text" placeholder="Search customers, plan IDs, pages…"
          style="flex:1;background:transparent;border:none;outline:none;
                 font-size:16px;color:var(--color-text-primary);font-family:inherit"
          autocomplete="off" spellcheck="false">
        <kbd style="font-size:11px;padding:2px 8px;border-radius:4px;
          background:var(--color-bg-secondary);border:1px solid var(--color-border);
          color:var(--color-text-tertiary);font-family:var(--font-mono)">ESC</kbd>
      </div>

      <div id="gs-results" style="max-height:400px;overflow-y:auto;padding:8px"></div>

      <div style="padding:10px 20px;border-top:1px solid var(--color-border);
                  font-size:11px;color:var(--color-text-tertiary);display:flex;gap:16px">
        <span><kbd style="padding:1px 5px;border-radius:3px;border:1px solid var(--color-border);
          font-family:var(--font-mono)">↑↓</kbd> navigate</span>
        <span><kbd style="padding:1px 5px;border-radius:3px;border:1px solid var(--color-border);
          font-family:var(--font-mono)">↵</kbd> open</span>
        <span><kbd style="padding:1px 5px;border-radius:3px;border:1px solid var(--color-border);
          font-family:var(--font-mono)">ESC</kbd> close</span>
      </div>
    </div>
  `;

  document.body.appendChild(_gsOverlay);

  const input      = document.getElementById('gs-input');
  const resultsEl  = document.getElementById('gs-results');
  let activeIdx    = -1;
  let currentItems = [];

  const navItems = getNavItems();
  currentItems = navItems;
  renderResults(currentItems);

  const runSearch = debounce(async (raw) => {
    const q = String(raw || '').trim();
    activeIdx = -1;
    const gen = ++_gsSearchGen;

    if (!q) {
      currentItems = navItems;
      renderResults(currentItems);
      return;
    }

    const qLower = q.toLowerCase();
    const pages = navItems.filter(i =>
      i.label.toLowerCase().includes(qLower) || i.subtitle.toLowerCase().includes(qLower)
    );

    resultsEl.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--color-text-tertiary);font-size:13px">
        Searching…
      </div>`;

    let customers = [];
    let plans = [];
    try {
      const role = AuthService.getUser()?.role;
      if (role && role !== 'customer') {
        const [custRes, planRes] = await Promise.all([
          CustomersService.list({ search: q, page: 1, pageSize: 8 }),
          InstallmentsService.listPlans({ search: q, page: 1, pageSize: 8 }),
        ]);
        if (gen !== _gsSearchGen) return;
        customers = (custRes?.data || []).map(c => ({
          label: c.fullName,
          subtitle: `${c.accountNumber ? `ID ${c.accountNumber} · ` : ''}${c.phone || ''}${c.city ? ` · ${c.city}` : ''}`,
          route: `customers/${c.id}`,
          icon: Icon('user'),
          kind: 'customer',
        }));
        plans = (planRes?.data || []).map(p => ({
          label: `Plan ${p.id}`,
          subtitle: `${p.customerName || 'Customer'}${p.productName ? ` · ${p.productName}` : ''} · ${p.status || ''}`,
          route: `installments/${p.id}`,
          icon: Icon('file-text'),
          kind: 'plan',
        }));
      }
    } catch {
      // Keep page results even if API search fails
    }

    if (gen !== _gsSearchGen) return;
    currentItems = [...customers, ...plans, ...pages];
    renderResults(currentItems);
  }, 220);

  input.addEventListener('input', e => runSearch(e.target.value));

  input.addEventListener('keydown', e => {
    const items = resultsEl.querySelectorAll('.gs-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!items.length) return;
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      highlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, -1);
      highlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = activeIdx >= 0 ? activeIdx : 0;
      items[idx]?.click();
    } else if (e.key === 'Escape') {
      closeSearch();
    }
  });

  function highlight(items) {
    items.forEach((el, i) => {
      el.style.background = i === activeIdx ? 'var(--color-bg-hover)' : '';
    });
    if (activeIdx >= 0) items[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }

  _gsOverlay.addEventListener('click', e => { if (e.target === _gsOverlay) closeSearch(); });

  function renderResults(items) {
    if (!items.length) {
      resultsEl.innerHTML = `
        <div style="text-align:center;padding:32px;color:var(--color-text-tertiary);font-size:14px">
          No results for "${input.value}"
        </div>`;
      return;
    }
    resultsEl.innerHTML = items.slice(0, 12).map(item => `
      <a href="#/${item.route}" class="gs-item"
        style="display:flex;align-items:center;gap:14px;padding:10px 12px;
               border-radius:var(--radius-sm);text-decoration:none;
               color:var(--color-text-primary);transition:background 0.1s;cursor:pointer">
        <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;flex-shrink:0;border-radius:var(--radius-sm);background:var(--color-accent-blue-dim);color:var(--color-accent-blue)">${item.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.label)}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.subtitle || '')}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="var(--color-text-tertiary)" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </a>
    `).join('');

    resultsEl.querySelectorAll('.gs-item').forEach(a => {
      a.addEventListener('mouseenter', () => a.style.background = 'var(--color-bg-hover)');
      a.addEventListener('mouseleave', () => a.style.background = '');
      a.addEventListener('click', closeSearch);
    });
  }

  input.focus();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function closeSearch() {
  if (_gsOverlay) {
    _gsOverlay.remove();
    _gsOverlay = null;
  }
}
