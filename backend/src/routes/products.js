import express from 'express';
import { pool, withTransaction } from '../db.js';
import { authenticate, requireMinRole } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { mapProduct } from '../services/mappers.js';
import { newId } from '../utils/ids.js';
import { asyncHandler, fail, ok, pagination, paginationParams } from '../utils/respond.js';

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = paginationParams(req);
  const values = [];
  const where = [];
  if (req.query.categoryId) {
    values.push(req.query.categoryId);
    where.push(`category_id = $${values.length}`);
  }
  if (req.query.status) {
    values.push(req.query.status);
    where.push(`status = $${values.length}`);
  }
  if (req.query.search) {
    values.push(`%${req.query.search}%`);
    where.push(`(name ILIKE $${values.length} OR sku ILIKE $${values.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query(`SELECT count(*)::int AS total FROM products ${whereSql}`, values);
  const result = await pool.query(
    `SELECT * FROM products ${whereSql} ORDER BY name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );
  return ok(res, result.rows.map(mapProduct), pagination(page, pageSize, count.rows[0].total));
}));

router.get('/active', asyncHandler(async (req, res) => {
  const values = [ 'active' ];
  const where = [ `status = $1` ];

  if (req.query.search) {
    values.push(`%${req.query.search}%`);
    where.push(`(name ILIKE $${values.length} OR sku ILIKE $${values.length})`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  let sql = `SELECT * FROM products ${whereSql} ORDER BY name ASC`;
  const limit = Number(req.query.limit || 0);
  if (limit > 0) {
    sql += ` LIMIT $${values.length + 1}`;
    values.push(limit);
  }

  const result = await pool.query(sql, values);
  return ok(res, result.rows.map(mapProduct));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!result.rowCount) return fail(res, 404, 'Product not found.');
  return ok(res, mapProduct(result.rows[0]));
}));

router.post('/', requireMinRole('manager'), asyncHandler(async (req, res) => {
  let { name, sku, price, stockQty = 0, categoryId, status = 'active' } = req.body || {};
  if (!name || !sku || price === undefined) return fail(res, 400, 'name, sku, and price are required.');
  if (typeof price !== 'number' || Number.isNaN(price) || price < 0) return fail(res, 400, 'A valid non-negative price is required.');
  if (typeof stockQty !== 'number' || Number.isNaN(stockQty) || stockQty < 0) return fail(res, 400, 'A valid non-negative stockQty is required.');
  if (!['active', 'inactive'].includes(status)) return fail(res, 400, 'Invalid status value.');
  if (categoryId === '') categoryId = null;
  const id = newId('prod');
  const row = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO products (id, name, category_id, price, sku, status, image_url, stock_qty, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [id, name, categoryId || null, price, sku, status, req.body.imageUrl || null, stockQty, req.body.description || null]
    );
    await writeAudit(client, req.user.id, 'CREATE', 'Product', id, `Created product: ${name}`);
    return inserted.rows[0];
  }).catch((error) => {
    if (error.code === '23503') return Object.assign(new Error('Selected category does not exist.'), { status: 400 });
    if (error.code === '23505' && (error.constraint === 'products_sku_key' || error.constraint === 'products_sku_unique')) {
      return Object.assign(new Error('SKU already exists.'), { status: 409 });
    }
    throw error;
  });
  if (row instanceof Error) return fail(res, row.status, row.message);
  return ok(res, mapProduct(row));
}));

router.put('/:id', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const existing = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return fail(res, 404, 'Product not found.');

  const { price, stockQty, status, categoryId } = req.body || {};
  if (price !== undefined && (typeof price !== 'number' || Number.isNaN(price) || price < 0)) {
    return fail(res, 400, 'A valid non-negative price is required.');
  }
  if (stockQty !== undefined && (typeof stockQty !== 'number' || Number.isNaN(stockQty) || stockQty < 0)) {
    return fail(res, 400, 'A valid non-negative stockQty is required.');
  }
  if (status !== undefined && !['active', 'inactive'].includes(status)) {
    return fail(res, 400, 'Invalid status value.');
  }

  const source = { ...mapProduct(existing.rows[0]), ...req.body };
  const normalizedCategoryId = categoryId === '' ? null : source.categoryId;

  const row = await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE products SET name=$2, category_id=$3, price=$4, sku=$5, status=$6,
       image_url=$7, stock_qty=$8, description=$9, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.id, source.name, normalizedCategoryId, source.price, source.sku, source.status, source.imageUrl, source.stockQty, source.description]
    );
    await writeAudit(client, req.user.id, 'UPDATE', 'Product', req.params.id, `Updated product: ${source.name}`);
    return updated.rows[0];
  }).catch((error) => {
    if (error.code === '23503') return Object.assign(new Error('Selected category does not exist.'), { status: 400 });
    if (error.code === '23505' && (error.constraint === 'products_sku_key' || error.constraint === 'products_sku_unique')) {
      return Object.assign(new Error('SKU already exists.'), { status: 409 });
    }
    throw error;
  });
  if (row instanceof Error) return fail(res, row.status, row.message);
  return ok(res, mapProduct(row));
}));

router.patch('/:id/stock', requireMinRole('manager'), asyncHandler(async (req, res) => {
  const { stockQty } = req.body;
  if (stockQty === undefined || typeof stockQty !== 'number' || stockQty < 0) {
    return fail(res, 400, 'Valid stockQty is required.');
  }
  
  const existing = await pool.query('SELECT name, stock_qty FROM products WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) return fail(res, 404, 'Product not found.');
  
  const oldStock = existing.rows[0].stock_qty;
  const row = await withTransaction(async (client) => {
    const updated = await client.query(
      'UPDATE products SET stock_qty = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [req.params.id, stockQty]
    );
    await writeAudit(client, req.user.id, 'UPDATE', 'Product', req.params.id, `Stock quantity changed from ${oldStock} to ${stockQty}`);
    return updated.rows[0];
  });
  return ok(res, mapProduct(row));
}));

router.delete('/:id', requireMinRole('manager'), asyncHandler(async (req, res) => {
  // Check if product is linked to any active/pending/due-soon/overdue plans
  const linkedPlans = await pool.query(
    `SELECT id FROM installment_plans 
     WHERE product_id = $1 AND status IN ('active', 'overdue', 'due-soon', 'pending')
     LIMIT 1`,
    [req.params.id]
  );
  if (linkedPlans.rowCount > 0) {
    return fail(res, 400, 'This product is linked to active installment plans and cannot be deleted.');
  }

  const row = await withTransaction(async (client) => {
    const deleted = await client.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]);
    if (!deleted.rowCount) return null;
    await writeAudit(client, req.user.id, 'DELETE', 'Product', req.params.id, `Deleted product: ${deleted.rows[0].name}`);
    return deleted.rows[0];
  });
  if (!row) return fail(res, 404, 'Product not found.');
  return ok(res, mapProduct(row));
}));

export default router;
