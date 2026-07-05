export function ok(res, data = null, pagination) {
  const body = { success: true, data, error: null };
  if (pagination) body.pagination = pagination;
  return res.json(body);
}

export function fail(res, status, error) {
  return res.status(status).json({ success: false, data: null, error });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function paginationParams(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 15), 1), 1000);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pagination(page, pageSize, total) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
