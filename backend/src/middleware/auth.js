import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { fail } from '../utils/respond.js';
import { atLeast } from '../utils/permissions.js';

export function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];
  if (!token) return fail(res, 401, 'Authentication token is required.');

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return fail(res, 401, 'Invalid or expired authentication token.');
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 403, 'You do not have permission to perform this action.');
    }
    return next();
  };
}

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user || !atLeast(req.user.role, minRole)) {
      return fail(res, 403, 'You do not have permission to perform this action.');
    }
    return next();
  };
}

export function customerOwns(customerId, req) {
  return req.user?.role !== 'customer' || req.user.customerId === customerId;
}
