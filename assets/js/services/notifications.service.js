/**
 * notifications.service.js
 * API: GET /api/notifications?userId=
 */

import { Config } from '../config.js';
import { api } from './api.js';
import { MOCK_NOTIFICATIONS } from '../mock/products.mock.js';
import AuthService from './auth.service.js';

const delay = ms => new Promise(r => setTimeout(r, ms));
let mockNotifs = [...MOCK_NOTIFICATIONS];

const NotificationsService = {
  async list() {
    const user = AuthService.getUser();
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      await delay(200);
      const data = mockNotifs.filter(n => n.userId === user?.id || n.userId === 'user-001');
      return { success: true, data, error: null };
    }
    return api.get('/notifications', { userId: user?.id });
  },

  async markRead(id) {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      const n = mockNotifs.find(n => n.id === id);
      if (n) n.isRead = true;
      return { success: true, data: null, error: null };
    }
    return api.patch(`/notifications/${id}`, { isRead: true });
  },

  async markAllRead() {
    if (Config.FEATURE_FLAGS.MOCK_MODE) {
      mockNotifs.forEach(n => n.isRead = true);
      return { success: true, data: null, error: null };
    }
    return api.post('/notifications/mark-all-read');
  },

  getUnreadCount() {
    return mockNotifs.filter(n => !n.isRead).length;
  },
};

export default NotificationsService;
