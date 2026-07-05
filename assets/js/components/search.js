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
// Module-level state so it is truly singleton across all page navigations.
let _gsOverlay   = null;
let _gsCtrlKBound = false;

const NAV_ITEMS = [
  { label: 'Dashboard',         subtitle: 'Business overview',         route: 'dashboard',           icon: '📊' },
  { label: 'Customers',         subtitle: 'Customer directory',         route: 'customers',           icon: '👥' },
  { label: 'Installment Plans', subtitle: 'Manage all plans',           route: 'installments',        icon: '📋' },
  { label: 'New Plan',          subtitle: 'Create an installment plan', route: 'installments/create', icon: '➕' },
  { label: 'Payments',          subtitle: 'Transaction ledger',         route: 'payments',            icon: '💳' },
  { label: 'Products',          subtitle: 'Inventory catalog',          route: 'products',            icon: '📦' },
  { label: 'Reports',           subtitle: 'Financial reports',          route: 'reports',             icon: '📈' },
  { label: 'Analytics',         subtitle: 'Charts & insights',          route: 'analytics',           icon: '📉' },
  { label: 'Settings',          subtitle: 'App configuration',          route: 'settings',            icon: '⚙️'  },
  { label: 'Audit Logs',        subtitle: 'Activity trail',             route: 'audit-logs',          icon: '🔍' },
  { label: 'Staff Users',       subtitle: 'Manage staff accounts',      route: 'users',               icon: '👤' },
];

/**
 * Initialise the global search overlay.
 * IDEMPOTENT — safe to call on every page navigation (renderNavbar is called each time).
 * The Ctrl+K listener is attached only once at module level.
 * The button click is re-attached each call because the button is a new DOM element.
 */
export function initGlobalSearch() {
  const btn = document.getElementById('global-search-btn');
  if (!btn) return;

  // Re-attach to the new button element (it's re-created by renderNavbar each navigation)
  btn.addEventListener('click', openSearch);

  // Ctrl+K / Cmd+K — attach only ONCE to the document
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
  if (_gsOverlay) return; // already open

  _gsOverlay = document.createElement('div');
  _gsOverlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.65);
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
    z-index:9999;display:flex;align-items:flex-start;
    justify-content:center;padding-top:10vh;
  `;

  _gsOverlay.innerHTML = `
    <div style="width:100%;max-width:580px;background:var(--color-bg-glass);
      backdrop-filter:var(--backdrop-blur);-webkit-backdrop-filter:var(--backdrop-blur);
      border:1px solid var(--color-border-strong);border-radius:var(--radius-lg);
      box-shadow:var(--shadow-lg);overflow:hidden">

      <!-- Input row -->
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;
                  border-bottom:1px solid var(--color-border)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="var(--color-text-tertiary)" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="gs-input" type="text" placeholder="Search pages, customers, installments…"
          style="flex:1;background:transparent;border:none;outline:none;
                 font-size:16px;color:var(--color-text-primary);font-family:inherit">
        <kbd style="font-size:11px;padding:2px 8px;border-radius:4px;
          background:var(--color-bg-secondary);border:1px solid var(--color-border);
          color:var(--color-text-tertiary);font-family:var(--font-mono)">ESC</kbd>
      </div>

      <!-- Results list -->
      <div id="gs-results" style="max-height:400px;overflow-y:auto;padding:8px"></div>

      <!-- Footer hints -->
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

  input.focus();
  renderResults(NAV_ITEMS);

  // Live filter
  input.addEventListener('input', debounce(e => {
    const q = e.target.value.toLowerCase().trim();
    activeIdx = -1;
    if (!q) { renderResults(NAV_ITEMS); return; }
    const filtered = NAV_ITEMS.filter(i =>
      i.label.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q)
    );
    renderResults(filtered.length ? filtered : []);
  }, 150));

  // Keyboard navigation
  input.addEventListener('keydown', e => {
    const items = resultsEl.querySelectorAll('.gs-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items.forEach((el, i) => el.style.background = i === activeIdx ? 'var(--color-bg-hover)' : '');
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, -1);
      items.forEach((el, i) => el.style.background = i === activeIdx ? 'var(--color-bg-hover)' : '');
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      items[activeIdx]?.click();
    } else if (e.key === 'Escape') {
      closeSearch();
    }
  });

  // Click outside closes
  _gsOverlay.addEventListener('click', e => { if (e.target === _gsOverlay) closeSearch(); });

  function renderResults(items) {
    if (!items.length) {
      resultsEl.innerHTML = `
        <div style="text-align:center;padding:32px;color:var(--color-text-tertiary);font-size:14px">
          No results for "${input.value}"
        </div>`;
      return;
    }
    resultsEl.innerHTML = items.slice(0, 10).map(item => `
      <a href="#/${item.route}" class="gs-item"
        style="display:flex;align-items:center;gap:14px;padding:10px 12px;
               border-radius:var(--radius-sm);text-decoration:none;
               color:var(--color-text-primary);transition:background 0.1s;cursor:pointer">
        <span style="font-size:20px;width:28px;text-align:center">${item.icon}</span>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:500">${item.label}</div>
          <div style="font-size:12px;color:var(--color-text-tertiary)">${item.subtitle}</div>
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
}

function closeSearch() {
  if (_gsOverlay) {
    _gsOverlay.remove();
    _gsOverlay = null;
  }
}
