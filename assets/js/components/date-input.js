/**
 * date-input.js — Force dd-mm-yyyy display on all date fields.
 *
 * Native <input type="date"> follows browser locale (often mm/dd/yyyy).
 * This wraps each date input with a visible dd-mm-yyyy text field while
 * keeping the native control for the calendar picker and ISO value.
 */

import { formatDate } from '../config.js';

const WIRED = 'data-dmy-wired';

/** Parse dd-mm-yyyy (or dd/mm/yyyy) → yyyy-mm-dd, or null if invalid. */
export function parseDmyToIso(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Format yyyy-mm-dd (or Date-like) as dd-mm-yyyy for inputs. */
export function toDmy(value) {
  if (!value) return '';
  const formatted = formatDate(value);
  return formatted === '—' ? '' : formatted;
}

function syncDisplay(native, display) {
  display.value = toDmy(native.value);
}

function applyTypedDate(native, display) {
  const iso = parseDmyToIso(display.value);
  if (!iso) {
    if (!String(display.value || '').trim()) {
      native.value = '';
      return true;
    }
    display.classList.add('error');
    return false;
  }
  display.classList.remove('error');
  native.value = iso;
  display.value = toDmy(iso);
  native.dispatchEvent(new Event('change', { bubbles: true }));
  native.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * Upgrade a single <input type="date"> to dd-mm-yyyy UI.
 * Keeps the same element/id so existing JS (.value) still gets yyyy-mm-dd.
 */
export function wireDateInput(native) {
  if (!(native instanceof HTMLInputElement)) return;
  if (native.type !== 'date') return;
  if (native.getAttribute(WIRED) === '1') return;
  if (native.closest('.date-input-dmy')) return;

  native.setAttribute(WIRED, '1');

  const wrap = document.createElement('div');
  wrap.className = 'date-input-dmy';
  native.parentNode.insertBefore(wrap, native);

  const display = document.createElement('input');
  display.type = 'text';
  display.className = native.className || 'form-control';
  display.placeholder = 'dd-mm-yyyy';
  display.inputMode = 'numeric';
  display.autocomplete = 'off';
  display.spellcheck = false;
  display.setAttribute('aria-label', native.getAttribute('aria-label') || native.id || 'Date');
  if (native.required) display.required = true;
  if (native.disabled) display.disabled = true;
  if (native.readOnly) display.readOnly = true;

  // Move native into wrap; hide its text, keep calendar affordance
  native.classList.add('date-input-dmy-native');
  wrap.appendChild(display);
  wrap.appendChild(native);

  syncDisplay(native, display);

  display.addEventListener('blur', () => applyTypedDate(native, display));
  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyTypedDate(native, display);
    }
  });

  // Auto-insert hyphens while typing digits
  display.addEventListener('input', () => {
    display.classList.remove('error');
    const digits = display.value.replace(/\D/g, '').slice(0, 8);
    let next = digits;
    if (digits.length > 4) next = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    else if (digits.length > 2) next = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (display.value !== next) display.value = next;
  });

  native.addEventListener('change', () => syncDisplay(native, display));
  native.addEventListener('input', () => syncDisplay(native, display));

  // Clicking the calendar icon / overlay opens the picker
  native.addEventListener('click', (e) => {
    // allow default picker
    e.stopPropagation();
  });

  // Keep display disabled state in sync if JS toggles native
  const obs = new MutationObserver(() => {
    display.disabled = native.disabled;
    display.readOnly = native.readOnly;
    if (native.required) display.required = true;
  });
  obs.observe(native, { attributes: true, attributeFilter: ['disabled', 'readonly', 'required'] });
}

/** Upgrade all date inputs under root (default: document). */
export function enhanceAllDateInputs(root = document) {
  root.querySelectorAll?.('input[type="date"]')?.forEach(wireDateInput);
}

/** Watch DOM for dynamically added date inputs (modals, etc.). */
let _observerStarted = false;
export function startDateInputObserver() {
  if (_observerStarted || typeof MutationObserver === 'undefined') return;
  _observerStarted = true;
  enhanceAllDateInputs(document);
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.('input[type="date"]')) wireDateInput(node);
        else enhanceAllDateInputs(node);
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
