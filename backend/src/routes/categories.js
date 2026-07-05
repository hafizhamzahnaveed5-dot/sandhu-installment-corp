import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, requireMinRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapCategory } from '../services/mappers.js';
import { newId } from '../utils/ids.js';
import { asyncHandler, fail, ok, pagination, paginationParams } from '../utils/respond.js';

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = paginationParams(req);
  const count = await pool.query('SELECT count(*)::int AS total FROM categories');
  const result = await pool.query('SELECT * FROM categories ORDER BY name ASC LIMIT $1 OFFSET $2', [pageSize, offset]);
  return ok(res, result.rows.map(mapCategory), pagination(page, pageSize, count.rows[0].total));
}));

router.post('/', requireMinRole('manager'), asyncHandler(async (req, res) => {
  if (!req.body?.name) return fail(res, 400, 'Category name is required.');
  const id = newId('cat');
  const row = await withTransaction(async (client) => {
    const inserted = await client.query(
      'INSERT INTO categories (id, name, parent_category_id) VALUES ($1,$2,$3) RETURNING *',
      [id, req.body.name, req.body.parentCategoryId || null]
    );
    await writeAudit(client, req.user.id, 'CREATE', 'Category', id, `Created category: ${req.body.name}`);
    return inserted.rows[0];
  });
  return ok(res, mapCategory(row));
}));

router.put('/:id', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const row = await withTransaction(async (client) => {
    const updated = await client.query(
      'UPDATE categories SET name=COALESCE($2,name), parent_category_id=$3, updated_at=now() WHERE id=$1 RETURNING *',
      [req.params.id, req.body?.name, req.body?.parentCategoryId || null]
    );
    if (!updated.rowCount) return null;
    await writeAudit(client, req.user.id, 'UPDATE', 'Category', req.params.id, `Updated category: ${updated.rows[0].name}`);
    return updated.rows[0];
  });
  if (!row) return fail(res, 404, 'Category not found.');
  return ok(res, mapCategory(row));
}));

router.delete('/:id', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const row = await withTransaction(async (client) => {
    const deleted = await client.query('DELETE FROM categories WHERE id = $1 RETURNING *', [req.params.id]);
    if (!deleted.rowCount) return null;
    await writeAudit(client, req.user.id, 'DELETE', 'Category', req.params.id, `Deleted category: ${deleted.rows[0].name}`);
    return deleted.rows[0];
  });
  if (!row) return fail(res, 404, 'Category not found.');
  return ok(res, mapCategory(row));
}));

export default router;
