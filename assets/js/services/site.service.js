/**
 * site.service.js — Business settings & web content
 * Loads from API (with short cache) and merges into Config.BUSINESS.
 */

import { Config } from '../config.js';
import { api } from './api.js';

const CACHE_KEY = 'sic_site_settings_cache';
const CACHE_TTL_MS = 60_000;
let memoryCache = null;
let memoryAt = 0;

function applyBusiness(business = {}) {
  if (!business || typeof business !== 'object') return;
  Config.BUSINESS.NAME = business.name || Config.BUSINESS.NAME;
  Config.BUSINESS.TAGLINE = business.tagline || Config.BUSINESS.TAGLINE;
  Config.BUSINESS.PHONE = business.phone || Config.BUSINESS.PHONE;
  Config.BUSINESS.WHATSAPP_NUMBER = (business.whatsapp || business.whatsappNumber || Config.BUSINESS.WHATSAPP_NUMBER || '').replace(/[^\d]/g, '');
  Config.BUSINESS.EMAIL = business.email || Config.BUSINESS.EMAIL;
  Config.BUSINESS.ADDRESS = business.address || Config.BUSINESS.ADDRESS;
  Config.BUSINESS.CURRENCY = business.currency || Config.BUSINESS.CURRENCY;

  // Customer-panel floating button toggles (default ON)
  Config.FEATURE_FLAGS.WHATSAPP_BUTTON = business.showWhatsappCustomer !== false;
  Config.FEATURE_FLAGS.AI_ASSISTANT = business.showAiCustomer !== false;
}

function readLocalCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch { /* ignore quota */ }
}

const SiteService = {
  async load(force = false) {
    const now = Date.now();
    if (!force && memoryCache && (now - memoryAt) < CACHE_TTL_MS) {
      applyBusiness(memoryCache.business);
      return memoryCache;
    }

    const local = readLocalCache();
    if (!force && local?.data && (now - (local.at || 0)) < CACHE_TTL_MS) {
      memoryCache = local.data;
      memoryAt = local.at;
      applyBusiness(memoryCache.business);
      return memoryCache;
    }

    try {
      const res = await api.get('/site-settings');
      if (res.success && res.data) {
        memoryCache = res.data;
        memoryAt = now;
        writeLocalCache(res.data);
        applyBusiness(res.data.business);
        return res.data;
      }
    } catch {
      if (local?.data) {
        memoryCache = local.data;
        memoryAt = local.at || now;
        applyBusiness(memoryCache.business);
        return memoryCache;
      }
    }
    return memoryCache || { business: {}, web_content: {} };
  },

  getCached() {
    return memoryCache || readLocalCache()?.data || { business: {}, web_content: {} };
  },

  async save(key, value) {
    const res = await api.put(`/site-settings/${key}`, { value });
    if (res.success) {
      memoryCache = { ...(memoryCache || {}), [key]: res.data };
      memoryAt = Date.now();
      writeLocalCache(memoryCache);
      if (key === 'business') applyBusiness(res.data);
    }
    return res;
  },
};

export default SiteService;
