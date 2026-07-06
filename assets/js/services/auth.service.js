/**
 * auth.service.js — Authentication & Role-Based Access Control service
 *
 * All auth logic goes through here. The mock implementation simulates
 * real network latency and validates credentials against mock users.
 *
 * When MOCK_MODE is false, these functions call the real API endpoints.
 */

import { Config } from '../config.js';
import { api } from './api.js';
import { MOCK_USERS } from '../mock/products.mock.js';

/** Simulate network delay for realistic mock feel */
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

const AuthService = {
  /**
   * Login a user by email and password.
   * @returns {Promise<{success, data: {user, token}|null, error}>}
   */
  async login(email, password) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(600);
      const user = MOCK_USERS.find(u => u.email === email && u.password === password);
      if (!user) {
        return { success: false, data: null, error: 'Invalid email or password.' };
      }
      const token = `mock-token-${user.id}-${Date.now()}`;
      const { password: _, ...safeUser } = user;
      sessionStorage.setItem(Config.AUTH.TOKEN_KEY, token);
      sessionStorage.setItem(Config.AUTH.USER_KEY, JSON.stringify(safeUser));
      return { success: true, data: { user: safeUser, token }, error: null };
    }
    const result = await api.post('/auth/login', { email, password });
    if (result.success) {
      sessionStorage.setItem(Config.AUTH.TOKEN_KEY, result.data.token);
      sessionStorage.setItem(Config.AUTH.USER_KEY, JSON.stringify(result.data.user));
    }
    return result;
  },

  /** Log out the current user */
  logout() {
    sessionStorage.removeItem(Config.AUTH.TOKEN_KEY);
    sessionStorage.removeItem(Config.AUTH.USER_KEY);
  },

  /** Get the currently logged-in user */
  getUser() {
    const raw = sessionStorage.getItem(Config.AUTH.USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  /** Check if there is an active session */
  isLoggedIn() {
    return !!sessionStorage.getItem(Config.AUTH.TOKEN_KEY);
  },

  /**
   * Check if current user has a specific permission string.
   * Admins have '*' which grants everything.
   */
  hasPermission(permission) {
    const user = this.getUser();
    if (!user) return false;
    if ((user.permissions || []).includes('*')) return true;
    return (user.permissions || []).includes(permission);
  },

  /**
   * Check if current user matches one of the given roles exactly.
   * @param {...string} roles
   */
  hasRole(...roles) {
    const user = this.getUser();
    if (!user) return false;
    return roles.includes(user.role);
  },

  /**
   * True if user's role is at least the given minimum.
   * Hierarchy: admin(4) > manager(3) > agent(2) > customer(1)
   */
  hasMinRole(minRole) {
    const user = this.getUser();
    if (!user) return false;
    const H = { admin: 4, manager: 3, agent: 2, customer: 1 };
    return (H[user.role] || 0) >= (H[minRole] || 0);
  },

  isAdmin()    { return this.hasRole('admin'); },
  isManager()  { return this.hasMinRole('manager'); },
  isCustomer() { return this.hasRole('customer'); },

  /**
   * Page-level access gate — returns true if current user can access a page.
   * @param {string} page — route key, e.g. 'users', 'dashboard', 'customers'
   */
  canAccess(page) {
    const user = this.getUser();
    if (!user) return ['login', 'forgot-password'].includes(page);

    const role = user.role;

    // Guest-only pages
    if (['login', 'forgot-password'].includes(page)) return false;

    // Admin-only pages
    if (['users', 'audit-logs'].includes(page) && role !== 'admin') return false;

    // Pages customers cannot access
    const customerBlocked = [
      'customers', 'installments', 'products',
      'reports', 'analytics', 'users', 'audit-logs',
    ];
    if (role === 'customer' && customerBlocked.some(p => page.startsWith(p))) return false;

    return true;
  },

  /**
   * Returns the correct home-dashboard route for the logged-in user's role.
   */
  getDashboardRoute() {
    const user = this.getUser();
    if (!user) return 'login';
    if (user.role === 'customer') return 'customer-dashboard';
    if (user.role === 'manager' || user.role === 'agent') return 'manager-dashboard';
    return 'dashboard'; // admin
  },

  /**
   * Create a new staff/customer user (admin only).
   * In mock mode, pushes to the in-memory MOCK_USERS array.
   */
  async createUser(payload) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(500);
      const existing = MOCK_USERS.find(u => u.email === payload.email);
      if (existing) return { success: false, data: null, error: 'Email already exists.' };

      if (payload.role === 'customer') {
        if (!payload.customerId) return { success: false, data: null, error: 'customerId is required for customer users.' };
        const existingCustomerUser = MOCK_USERS.find(u => u.customerId === payload.customerId);
        if (existingCustomerUser) return { success: false, data: null, error: 'This customer already has a linked user account.' };
      }

      const permMap = {
        admin:    ['*'],
        manager:  ['customers.read','customers.write','installments.*','payments.*','reports.read'],
        agent:    ['customers.read','installments.read','payments.create'],
        customer: ['my-plan.read','my-payments.read'],
      };
      const newUser = {
        id: `user-${Date.now()}`,
        name: payload.name,
        email: payload.email,
        role: payload.role || 'agent',
        permissions: permMap[payload.role] || permMap.agent,
        status: 'active',
        password: payload.password || 'changeme123',
        lastLogin: null,
      };
      if (payload.role === 'customer') {
        newUser.customerId = payload.customerId;
      }
      
      MOCK_USERS.push(newUser);
      return { success: true, data: newUser, error: null };
    }
    return api.post('/users', payload);
  },

  /** Update an existing user */
  async updateUser(id, payload) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(400);
      const idx = MOCK_USERS.findIndex(u => u.id === id);
      if (idx === -1) return { success: false, data: null, error: 'User not found.' };
      
      const existing = MOCK_USERS[idx];
      
      // Basic last-admin safeguard for mock mode
      if (existing.role === 'admin' && (payload.role !== 'admin' || payload.status !== 'active')) {
        const adminCount = MOCK_USERS.filter(u => u.role === 'admin' && u.status === 'active').length;
        if (adminCount <= 1) return { success: false, data: null, error: 'Cannot demote or deactivate the last active admin account.' };
      }

      const permMap = {
        admin:    ['*'],
        manager:  ['customers.read','customers.write','installments.*','payments.*','reports.read'],
        agent:    ['customers.read','installments.read','payments.create'],
        customer: ['my-plan.read','my-payments.read'],
      };

      MOCK_USERS[idx] = { 
        ...existing, 
        name: payload.name, 
        role: payload.role, 
        status: payload.status,
        permissions: permMap[payload.role] || existing.permissions 
      };
      return { success: true, data: MOCK_USERS[idx], error: null };
    }
    return api.put(`/users/${id}`, payload);
  },

  /** Delete a user */
  async deleteUser(id) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(400);
      const currentUser = this.getUser();
      if (id === currentUser?.id) return { success: false, data: null, error: 'You cannot delete your own account.' };

      const idx = MOCK_USERS.findIndex(u => u.id === id);
      if (idx === -1) return { success: false, data: null, error: 'User not found.' };

      const existing = MOCK_USERS[idx];
      if (existing.role === 'admin') {
        const adminCount = MOCK_USERS.filter(u => u.role === 'admin' && u.status === 'active').length;
        if (adminCount <= 1) return { success: false, data: null, error: 'Cannot delete the last active admin account.' };
      }

      const [deleted] = MOCK_USERS.splice(idx, 1);
      return { success: true, data: deleted, error: null };
    }
    return api.delete(`/users/${id}`);
  },

  /** List all system users (admin only) */
  async listUsers() {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(300);
      // Never expose passwords
      return {
        success: true,
        data: MOCK_USERS.map(({ password: _, ...u }) => u),
        error: null,
      };
    }
    return api.get('/users');
  },

  /**
   * Send a forgot-password reset email.
   * DECISION: Always returns success to prevent email enumeration.
   */
  async forgotPassword(email) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(800);
      return { success: true, data: null, error: null };
    }
    return api.post('/auth/forgot-password', { email });
  },

  /** Change the current user's password */
  async changePassword(currentPassword, newPassword) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(600);
      return { success: true, data: { message: 'Mock password updated successfully' }, error: null };
    }
    return api.put('/users/me/password', { currentPassword, newPassword });
  },
};

export default AuthService;
