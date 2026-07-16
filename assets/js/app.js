/**
 * app.js — Application entry point
 * 
 * Responsibilities:
 * 1. Theme initialization (persisted in localStorage)
 * 2. Auth guard (redirect unauthenticated users to login)
 * 3. Hash-based SPA router
 * 4. Sidebar collapse state persistence
 * 5. Floating buttons (WhatsApp, AI Assistant)
 * 
 * DECISION: Hash-based routing (#/dashboard) used over history API
 * because static hosting (Netlify/Cloudflare) needs no server-side
 * fallback configuration. For history-based routing, add a _redirects
 * or vercel.json rewrite and change the router implementation below.
 */

import AuthService from './services/auth.service.js';
import { renderSidebar, setActiveNav } from './components/sidebar.js';
import { renderNavbar } from './components/navbar.js';
import { Config } from './config.js';
import SiteService from './services/site.service.js';
import { startDateInputObserver } from './components/date-input.js';

// ── Theme Initialization ──────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('sic_theme') || 'light';
  document.documentElement.dataset.theme = saved;
})();

// Prefetch site settings (non-blocking), then refresh FABs for customer role
SiteService.load().then(() => {
  if (AuthService.isLoggedIn()) renderFloatingButtons();
}).catch(() => {});

// ── Route Map ─────────────────────────────────────────────────
// DECISION: Each route is a lazy-loaded ES module.
// The import() call triggers the browser to fetch only the page
// code actually needed — no manual bundling required.
const ROUTES = {
  'login':               () => import('./pages/login.js'),
  'forgot-password':     () => import('./pages/forgot-password.js'),
  'dashboard':           () => import('./pages/dashboard.js'),
  'manager-dashboard':   () => import('./pages/manager-dashboard.js'),
  'customer-dashboard':  () => import('./pages/customer-dashboard.js'),
  'customers':           () => import('./pages/customers.js'),
  'customers/:id':       () => import('./pages/customer-detail.js'),
  'installments':        () => import('./pages/installments.js'),
  'installments/create': () => import('./pages/installment-create.js'),
  'installments/:id':    () => import('./pages/installment-schedule.js'),
  'payments':            () => import('./pages/payments.js'),
  'payments/:id':        () => import('./pages/receipt.js'),
  'products':            () => import('./pages/products.js'),
  'roznamcha':           () => import('./pages/roznamcha.js'),
  'reports':             () => import('./pages/reports.js'),
  'analytics':           () => import('./pages/analytics.js'),
  'settings':            () => import('./pages/settings.js'),
  'web-content':         () => import('./pages/web-content.js'),
  'profile':             () => import('./pages/profile.js'),
  'users':               () => import('./pages/users.js'),
  'audit-logs':          () => import('./pages/audit-logs.js'),
  'notifications':       () => import('./pages/notifications.js'),
  'support':             () => import('./pages/support.js'),
  '404':                 () => import('./pages/404.js'),
};

const PUBLIC_ROUTES = ['login', 'forgot-password'];

// ── Router ────────────────────────────────────────────────────
async function route() {
  // Strip query string from the path BEFORE splitting into segments.
  // e.g. "#/customers?status=active" → path="customers", search="status=active"
  // Each page reads query params itself via window.location.hash.split('?')[1]
  const rawHash = window.location.hash.replace('#/', '') || 'dashboard';
  const [path] = rawHash.split('?');             // discard query string for routing
  const segments = path.split('/');
  const base = segments[0];
  const param = segments[1];

  // Auth guard
  if (!PUBLIC_ROUTES.includes(base) && !AuthService.isLoggedIn()) {
    window.location.hash = '/login';
    return;
  }
  // Redirect logged-in users away from login page to their role-appropriate dashboard
  if (PUBLIC_ROUTES.includes(base) && AuthService.isLoggedIn()) {
    window.location.hash = '/' + AuthService.getDashboardRoute();
    return;
  }
  // Redirect bare '/' or 'dashboard' to role dashboard
  if (!PUBLIC_ROUTES.includes(base) && AuthService.isLoggedIn()) {
    const dashRoute = AuthService.getDashboardRoute();
    if (base === 'dashboard' && dashRoute !== 'dashboard') {
      window.location.hash = '/' + dashRoute;
      return;
    }
  }

  // Determine which shell to show
  const isPublic = PUBLIC_ROUTES.includes(base);
  toggleShell(!isPublic);

  // Find route loader — IMPORTANT: check explicit sub-routes BEFORE wildcard :id
  let routeKey = base;
  if (param === 'create' && ROUTES[`${base}/create`]) {
    routeKey = `${base}/create`;
  } else if (param && ROUTES[`${base}/:id`]) {
    routeKey = `${base}/:id`;
  }

  const loader = ROUTES[routeKey] || ROUTES['404'];

  try {
    // Clear and show skeleton while loading
    const content = document.getElementById('page-content');
    if (content) content.innerHTML = renderPageSkeleton();

    const module = await loader();
    const init = module.default || module.init;
    if (typeof init === 'function') {
      await init({ param, hash: rawHash, path });
    }

    // Update sidebar active state
    setActiveNav(base);

    // Scroll to top on navigation
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (err) {
    console.error('[Router] Failed to load page:', err);
    const content = document.getElementById('page-content');
    if (content) {
      content.innerHTML = `
        <div class="empty-state">
          <h3>Something went wrong</h3>
          <p>${err.message}</p>
          <a class="btn btn-primary mt-4" href="#/dashboard">Go to Dashboard</a>
        </div>
      `;
    }
  }
}

function toggleShell(show) {
  const shell = document.getElementById('app-shell');
  const auth  = document.getElementById('auth-layout');
  if (!shell || !auth) return;
  if (show) {
    shell.style.display = 'flex';
    auth.style.display  = 'none';
    renderSidebar();
    restoreSidebarState();
  } else {
    shell.style.display = 'none';
    auth.style.display  = 'flex';
  }
}

function restoreSidebarState() {
  const savedState = localStorage.getItem('sic_sidebar');
  const sidebar = document.getElementById('sidebar');
  const wrapper = document.getElementById('main-wrapper');
  if (savedState === 'collapsed' && sidebar && wrapper) {
    sidebar.classList.add('collapsed');
    wrapper.classList.add('expanded');
  }
}

function renderPageSkeleton() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <div class="skeleton skeleton-title" style="width:200px;height:28px;margin-bottom:8px"></div>
        <div class="skeleton skeleton-text" style="width:300px"></div>
      </div>
    </div>
    <div class="kpi-grid">
      ${[1,2,3,4].map(() => `
        <div class="stat-card">
          <div class="skeleton skeleton-circle" style="width:44px;height:44px;margin-bottom:16px"></div>
          <div class="skeleton skeleton-title" style="width:80px;height:28px;margin-bottom:8px"></div>
          <div class="skeleton skeleton-text" style="width:120px"></div>
        </div>
      `).join('')}
    </div>
    <div class="card" style="height:280px">
      <div class="skeleton" style="width:100%;height:100%;border-radius:var(--radius-md)"></div>
    </div>
  `;
}

// ── Floating Buttons (customer panel only, draggable) ─────────
function renderFloatingButtons() {
  const existing = document.getElementById('fab-container');
  const existingPanel = document.getElementById('ai-panel');
  const user = AuthService.getUser();
  const isCustomer = user?.role === 'customer';

  // Staff/admin: never show WhatsApp / AI FABs
  if (!isCustomer) {
    existing?.remove();
    existingPanel?.remove();
    return;
  }

  const showWhatsapp = Config.FEATURE_FLAGS.WHATSAPP_BUTTON !== false;
  const showAi = Config.FEATURE_FLAGS.AI_ASSISTANT !== false;
  if (!showWhatsapp && !showAi) {
    existing?.remove();
    existingPanel?.remove();
    return;
  }

  // Rebuild so toggles take effect after settings change
  existing?.remove();

  const fab = document.createElement('div');
  fab.id = 'fab-container';
  fab.className = 'fab-container fab-draggable';
  fab.title = 'Drag to move';

  const savedPos = (() => {
    try { return JSON.parse(localStorage.getItem('sic_fab_pos') || 'null'); } catch { return null; }
  })();
  if (savedPos?.left != null && savedPos?.top != null) {
    fab.style.left = `${savedPos.left}px`;
    fab.style.top = `${savedPos.top}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }

  if (showWhatsapp) {
    const whatsapp = document.createElement('a');
    whatsapp.href = `https://wa.me/${Config.BUSINESS.WHATSAPP_NUMBER}?text=${encodeURIComponent('Hello ' + (Config.BUSINESS.NAME || 'Sandhu Installment Corporation'))}`;
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
    whatsapp.className = 'fab fab-whatsapp';
    whatsapp.setAttribute('aria-label', 'Contact on WhatsApp');
    whatsapp.innerHTML = `
      <span class="fab-label">WhatsApp</span>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    `;
    fab.appendChild(whatsapp);
  }

  if (showAi) {
    const aiBtn = document.createElement('button');
    aiBtn.className = 'fab fab-ai';
    aiBtn.id = 'ai-fab';
    aiBtn.type = 'button';
    aiBtn.setAttribute('aria-label', 'AI Assistant');
    aiBtn.innerHTML = `
      <span class="fab-label">AI Assistant</span>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
      </svg>
    `;
    aiBtn.addEventListener('click', (e) => {
      if (fab.dataset.dragging === '1') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      toggleAiPanel();
    });
    fab.appendChild(aiBtn);
  }

  document.body.appendChild(fab);
  makeFabDraggable(fab);

  if (showAi && !document.getElementById('ai-panel')) {
    renderAiPanel();
  } else if (!showAi) {
    existingPanel?.remove();
  }
}

function makeFabDraggable(fab) {
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;
  let moved = false;

  const onPointerDown = (e) => {
    // Don't start drag from middle of a click on links unless holding a bit
    if (e.button != null && e.button !== 0) return;
    const point = e.touches ? e.touches[0] : e;
    const rect = fab.getBoundingClientRect();
    startX = point.clientX;
    startY = point.clientY;
    origLeft = rect.left;
    origTop = rect.top;
    moved = false;
    fab.dataset.dragging = '0';
    fab.style.left = `${origLeft}px`;
    fab.style.top = `${origTop}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fab.classList.add('is-dragging');

    const onMove = (ev) => {
      const p = ev.touches ? ev.touches[0] : ev;
      const dx = p.clientX - startX;
      const dy = p.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        moved = true;
        fab.dataset.dragging = '1';
      }
      const maxLeft = window.innerWidth - fab.offsetWidth - 8;
      const maxTop = window.innerHeight - fab.offsetHeight - 8;
      const left = Math.max(8, Math.min(maxLeft, origLeft + dx));
      const top = Math.max(8, Math.min(maxTop, origTop + dy));
      fab.style.left = `${left}px`;
      fab.style.top = `${top}px`;
      if (ev.cancelable) ev.preventDefault();
    };

    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      fab.classList.remove('is-dragging');
      if (moved) {
        const left = parseFloat(fab.style.left) || 8;
        const top = parseFloat(fab.style.top) || 8;
        localStorage.setItem('sic_fab_pos', JSON.stringify({ left, top }));
        // Prevent click-through after drag
        if (ev.target?.closest?.('a.fab-whatsapp')) {
          ev.preventDefault?.();
        }
        setTimeout(() => { fab.dataset.dragging = '0'; }, 50);
      } else {
        fab.dataset.dragging = '0';
      }
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  fab.addEventListener('pointerdown', onPointerDown);
}

function renderAiPanel() {
  if (!Config.FEATURE_FLAGS.AI_ASSISTANT) return;

  const panel = document.createElement('div');
  panel.className = 'ai-panel';
  panel.id = 'ai-panel';
  panel.innerHTML = `
    <div class="ai-panel-header">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--color-accent-blue),var(--color-accent-cyan));display:flex;align-items:center;justify-content:center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          </svg>
        </div>
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--color-text-primary)">AI Assistant</div>
          <div style="font-size:11px;color:var(--color-text-tertiary)">Powered by Sandhu IC</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-icon" id="ai-panel-close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="ai-panel-messages" id="ai-messages">
      <div class="chat-msg bot">
        <div class="chat-bubble">
          👋 Hello! I'm your Sandhu IC assistant. I can help you with:<br>
          • Finding customer installment status<br>
          • Today's due payments<br>
          • Quick business stats
        </div>
        <div class="chat-time">Just now</div>
      </div>
    </div>
    <div class="ai-quick-replies" id="ai-quick-replies">
      <button class="quick-reply-btn" data-msg="Show today's due payments">Today's due</button>
      <button class="quick-reply-btn" data-msg="How many overdue installments?">Overdue count</button>
      <button class="quick-reply-btn" data-msg="Total revenue this month">Monthly revenue</button>
    </div>
    <div class="ai-input-area">
      <textarea class="ai-input" id="ai-input" placeholder="Ask something..." rows="1"></textarea>
      <button class="btn btn-primary btn-icon" id="ai-send" aria-label="Send">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('ai-panel-close')?.addEventListener('click', toggleAiPanel);

  document.getElementById('ai-send')?.addEventListener('click', sendAiMessage);
  document.getElementById('ai-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  });

  document.querySelectorAll('.quick-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => sendAiMessage(btn.dataset.msg));
  });
}

const AI_CANNED_RESPONSES = {
  "show today's due payments": "📅 Let me check... There are currently <strong>3 installments due today</strong>. Navigate to <a href='#/installments' style='color:var(--color-accent-blue)'>Installments</a> to see the full list.",
  "how many overdue installments?": "⚠️ There are currently <strong>2 overdue installments</strong> in the system. Please follow up with the customers to avoid defaults.",
  "total revenue this month": "💰 This month's collections so far: <strong>PKR 43,750</strong>. That's <strong>63%</strong> of last month's total. Check the <a href='#/reports' style='color:var(--color-accent-blue)'>Reports</a> page for full breakdown.",
  default: "I understand you're asking about <strong>\"{query}\"</strong>. I can help with installment status, customer lookups, and payment summaries. For detailed queries, visit the relevant page or contact your admin.\n\n<em style='font-size:11px;color:var(--color-text-tertiary)'>// TODO: Connect to /api/ai/chat for real LLM responses</em>",
};

function sendAiMessage(text) {
  const input = document.getElementById('ai-input');
  const msg = (text || input?.value || '').trim();
  if (!msg) return;
  if (input) input.value = '';

  const messages = document.getElementById('ai-messages');
  if (!messages) return;

  // User message
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-msg user';
  userBubble.innerHTML = `<div class="chat-bubble">${msg}</div><div class="chat-time">Just now</div>`;
  messages.appendChild(userBubble);

  // Typing indicator
  const typing = document.createElement('div');
  typing.className = 'chat-msg bot';
  typing.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  messages.appendChild(typing);
  messages.scrollTop = messages.scrollHeight;

  // Canned response after delay
  // TODO: Connect to /api/ai/chat for real LLM responses
  setTimeout(() => {
    typing.remove();
    const key = msg.toLowerCase();
    let response = AI_CANNED_RESPONSES[key] || AI_CANNED_RESPONSES.default.replace('{query}', msg);

    const botBubble = document.createElement('div');
    botBubble.className = 'chat-msg bot';
    botBubble.innerHTML = `<div class="chat-bubble">${response}</div><div class="chat-time">Just now</div>`;
    messages.appendChild(botBubble);
    messages.scrollTop = messages.scrollHeight;
  }, 1200);
}

function toggleAiPanel() {
  document.getElementById('ai-panel')?.classList.toggle('open');
}

// ── App Init ──────────────────────────────────────────────────
async function init() {
  // Route on hash change
  window.addEventListener('hashchange', route);

  // Mobile sidebar overlay
  const overlay = document.getElementById('sidebar-overlay');
  overlay?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    overlay.classList.remove('visible');
  });

  // Render floating buttons (always visible after login)
  window.addEventListener('hashchange', () => {
    const rawH = window.location.hash.replace('#/', '');
    const isPublic = ['login', 'forgot-password'].includes(rawH.split('?')[0].split('/')[0]);
    if (!isPublic && AuthService.isLoggedIn()) renderFloatingButtons();
  });

  // Initial route
  await route();

  // Force dd-mm-yyyy on all date pickers (including modals)
  startDateInputObserver();

  // Show floating buttons if logged in
  if (AuthService.isLoggedIn()) renderFloatingButtons();
}

init();
