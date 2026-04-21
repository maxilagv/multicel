const { query, withTransaction } = require('../../db/pg');
const catalogSync = require('../../services/catalogSyncService');

function normalizeParentId(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeSortOrder(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function makeError(message, { code, status } = {}) {
  const err = new Error(message);
  if (code) err.code = code;
  if (status) err.status = status;
  return err;
}

function buildTree(rows) {
  const nodeById = new Map();
  const roots = [];

  for (const row of rows) {
    nodeById.set(Number(row.id), { ...row, children: [] });
  }

  for (const row of rows) {
    const id = Number(row.id);
    const parentId = row.parent_id != null ? Number(row.parent_id) : null;
    const node = nodeById.get(id);
    if (!node) continue;
    if (parentId == null || !nodeById.has(parentId)) {
      roots.push(node);
      continue;
    }
    nodeById.get(parentId).children.push(node);
  }

  return roots;
}

function inClause(values, start = 1) {
  return values.map((_, idx) => `$${start + idx}`).join(', ');
}

async function getActiveParent(client, parentId) {
  if (parentId == null) return null;
  const parent = await client.query(
    `SELECT id, activo, depth, path
       FROM categorias
      WHERE id = $1
      LIMIT 1`,
    [parentId]
  );
  if (!parent.rowCount || !parent.rows[0]?.activo) {
    throw makeError('La categoria padre no existe o esta inactiva', {
      code: 'CATEGORY_PARENT_NOT_FOUND',
      status: 400,
    });
  }
  return parent.rows[0];
}

async function updateDepthAndPath(client, id, parentRow) {
  const parentPath = parentRow?.path || '/';
  const parentDepth = Number(parentRow?.depth || 0);
  const depth = parentRow ? parentDepth + 1 : 0;
  const path = `${parentPath}${id}/`;
  await client.query(
    'UPDATE categorias SET depth = $1, path = $2 WHERE id = $3',
    [depth, path, id]
  );
  return { depth, path };
}

async function getAllActive() {
  const { rows } = await query(
    `SELECT id,
            nombre AS name,
            imagen_url AS image_url,
            descripcion AS description,
            parent_id,
            depth,
            path,
            sort_order
       FROM categorias
      WHERE activo = TRUE
      ORDER BY depth ASC, COALESCE(parent_id, 0) ASC, sort_order ASC, nombre ASC`
  );
  return rows;
}

async function getAllActiveTree() {
  const rows = await getAllActive();
  return buildTree(rows);
}

async function findByName(name, parentId) {
  if (typeof parentId === 'undefined') {
    const { rows } = await query(
      `SELECT id, nombre, activo, parent_id, depth, path, sort_order
         FROM categorias
        WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
      ORDER BY activo DESC, depth ASC, id ASC
        LIMIT 1`,
      [name]
    );
    return rows[0] || null;
  }

  const parentIdNorm = normalizeParentId(parentId);
  const { rows } = await query(
    `SELECT id, nombre, activo, parent_id, depth, path, sort_order
       FROM categorias
      WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
        AND COALESCE(parent_id, 0) = COALESCE($2, 0)
      ORDER BY activo DESC, id ASC
      LIMIT 1`,
    [name, parentIdNorm]
  );
  return rows[0] || null;
}

async function getCategoryFilterIds(categoryId, { includeDescendants = false, onlyActive = true } = {}) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) return [];

  if (!includeDescendants) {
    const { rows } = await query(
      `SELECT id
         FROM categorias
        WHERE id = $1
          ${onlyActive ? 'AND activo = TRUE' : ''}
        LIMIT 1`,
      [id]
    );
    return rows.map((r) => Number(r.id)).filter((v) => Number.isInteger(v) && v > 0);
  }

  const activeFilterRoot = onlyActive ? 'AND activo = TRUE' : '';
  const activeFilterChild = onlyActive ? 'WHERE c.activo = TRUE' : '';
  const { rows } = await query(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id
         FROM categorias
        WHERE id = $1
          ${activeFilterRoot}
       UNION ALL
       SELECT c.id
         FROM categorias c
         JOIN subtree s ON c.parent_id = s.id
        ${activeFilterChild}
     )
     SELECT id
       FROM subtree
   ORDER BY id`,
    [id]
  );
  return rows.map((r) => Number(r.id)).filter((v) => Number.isInteger(v) && v > 0);
}

async function findById(id) {
  const { rows } = await query(
    `SELECT id, nombre, activo, parent_id, depth, path, sort_order
       FROM categorias
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function restoreOrInsert({ name, image_url, description, parent_id, sort_order }) {
  return withTransaction(async (client) => {
    const parentId = normalizeParentId(parent_id);
    const sortOrder = normalizeSortOrder(sort_order, 0);
    const parentRow = await getActiveParent(client, parentId);

    const existing = await client.query(
      `SELECT id, activo
         FROM categorias
        WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
          AND COALESCE(parent_id, 0) = COALESCE($2, 0)
        LIMIT 1`,
      [name, parentId]
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (!row.activo) {
        const upd = await client.query(
          `UPDATE categorias
              SET imagen_url = $1,
                  descripcion = $2,
                  activo = TRUE,
                  parent_id = $3,
                  sort_order = $4
            WHERE id = $5
            RETURNING id`,
          [image_url || null, description || null, parentId, sortOrder, row.id]
        );
        await updateDepthAndPath(client, upd.rows[0].id, parentRow);
        await catalogSync.enqueueCategory(Number(upd.rows[0].id), client);
        return { id: Number(upd.rows[0].id), restored: true };
      } else {
        const err = new Error('El nombre de la categoria ya existe');
        err.code = '23505';
        throw err;
      }
    }

    const parentPath = parentRow?.path || '/';
    const parentDepth = Number(parentRow?.depth || 0);
    const depth = parentRow ? parentDepth + 1 : 0;

    const ins = await client.query(
      `INSERT INTO categorias(nombre, imagen_url, descripcion, parent_id, depth, path, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [name, image_url || null, description || null, parentId, depth, `${parentPath}tmp/`, sortOrder]
    );
    await updateDepthAndPath(client, Number(ins.rows[0].id), parentRow);
    await catalogSync.enqueueCategory(Number(ins.rows[0].id), client);
    return { id: Number(ins.rows[0].id), restored: false };
  });
}

async function updateCategory(id, { name, image_url, description }) {
  const sets = [];
  const params = [];
  let p = 1;
  if (typeof name !== 'undefined') { sets.push(`nombre = $${p++}`); params.push(name); }
  if (typeof description !== 'undefined') { sets.push(`descripcion = $${p++}`); params.push(description || null); }
  if (typeof image_url !== 'undefined') { sets.push(`imagen_url = $${p++}`); params.push(image_url || null); }
  if (!sets.length) return { id };
  const sql = `UPDATE categorias SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`;
  params.push(id);
  const result = await query(sql, params);
  if (result.rows[0]?.id) {
    await catalogSync.enqueueCategory(result.rows[0].id);
  }
  return result.rows[0] || null;
}

async function moveCategory(id, { parent_id, sort_order }) {
  return withTransaction(async (client) => {
    const idNum = Number(id);
    const category = await client.query(
      `SELECT id, activo, nombre, parent_id, depth, path, sort_order
         FROM categorias
        WHERE id = $1
        LIMIT 1`,
      [idNum]
    );
    if (!category.rowCount || !category.rows[0]?.activo) {
      throw makeError('Categoria no encontrada', { code: 'CATEGORY_NOT_FOUND', status: 404 });
    }

    const row = category.rows[0];
    const nextParentId = normalizeParentId(parent_id);
    if (nextParentId != null && nextParentId === idNum) {
      throw makeError('No se puede mover una categoria dentro de si misma', {
        code: 'CATEGORY_CYCLE',
        status: 400,
      });
    }

    if (nextParentId != null) {
      const cycleCheck = await client.query(
        `WITH RECURSIVE subtree(id) AS (
           SELECT id FROM categorias WHERE id = $1
           UNION ALL
           SELECT c.id
             FROM categorias c
             JOIN subtree s ON c.parent_id = s.id
         )
         SELECT 1 AS found FROM subtree WHERE id = $2 LIMIT 1`,
        [idNum, nextParentId]
      );
      if (cycleCheck.rowCount) {
        throw makeError('No se puede mover la categoria dentro de un descendiente', {
          code: 'CATEGORY_CYCLE',
          status: 400,
        });
      }
    }

    const parentRow = await getActiveParent(client, nextParentId);
    const newSortOrder = normalizeSortOrder(sort_order, Number(row.sort_order || 0));
    const dup = await client.query(
      `SELECT id
         FROM categorias
        WHERE id <> $1
          AND activo = TRUE
          AND LOWER(TRIM(nombre)) = LOWER(TRIM($2))
          AND COALESCE(parent_id, 0) = COALESCE($3, 0)
        LIMIT 1`,
      [idNum, row.nombre, nextParentId]
    );
    if (dup.rowCount) {
      const err = new Error('El nombre de la categoria ya existe para el mismo nivel');
      err.code = '23505';
      throw err;
    }

    const oldDepth = Number(row.depth || 0);
    const oldPath = String(row.path || `/${idNum}/`);
    const newDepth = parentRow ? Number(parentRow.depth || 0) + 1 : 0;
    const newPath = `${parentRow?.path || '/'}${idNum}/`;

    await client.query(
      `UPDATE categorias
          SET parent_id = $1,
              sort_order = $2,
              depth = $3,
              path = $4
        WHERE id = $5`,
      [nextParentId, newSortOrder, newDepth, newPath, idNum]
    );

    await client.query(
      `UPDATE categorias
          SET depth = $1 + (depth - $2),
              path = CONCAT($3, SUBSTRING(path, $4))
        WHERE id <> $5
          AND path LIKE $6`,
      [newDepth, oldDepth, newPath, oldPath.length + 1, idNum, `${oldPath}%`]
    );

    const affected = await client.query(
      'SELECT id FROM categorias WHERE path LIKE $1 ORDER BY depth ASC, id ASC',
      [`${newPath}%`]
    );
    for (const item of affected.rows || []) {
      await catalogSync.enqueueCategory(Number(item.id), client);
    }

    return {
      id: idNum,
      parent_id: nextParentId,
      moved: Number(affected.rowCount || 0),
    };
  });
}

async function deactivateCascade(id) {
  return withTransaction(async (client) => {
    const root = await client.query('SELECT id, activo FROM categorias WHERE id = $1 LIMIT 1', [id]);
    if (!root.rowCount || !root.rows[0]?.activo) {
      throw makeError('Categoria no encontrada', { code: 'CATEGORY_NOT_FOUND', status: 404 });
    }

    const subtree = await client.query(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id
           FROM categorias
          WHERE id = $1
            AND activo = TRUE
         UNION ALL
         SELECT c.id
           FROM categorias c
           JOIN subtree s ON c.parent_id = s.id
          WHERE c.activo = TRUE
       )
       SELECT id FROM subtree`,
      [id]
    );

    const categoryIds = subtree.rows.map((r) => Number(r.id)).filter((v) => Number.isInteger(v) && v > 0);
    if (!categoryIds.length) {
      throw makeError('Categoria no encontrada', { code: 'CATEGORY_NOT_FOUND', status: 404 });
    }

    const idsSql = inClause(categoryIds, 1);
    await client.query(
      `UPDATE productos
          SET activo = FALSE
        WHERE activo = TRUE
          AND categoria_id IN (${idsSql})`,
      categoryIds
    );
    await client.query(
      `UPDATE categorias
          SET activo = FALSE
        WHERE activo = TRUE
          AND id IN (${idsSql})`,
      categoryIds
    );

    const products = await client.query(
      `SELECT id
         FROM productos
        WHERE categoria_id IN (${idsSql})`,
      categoryIds
    );

    for (const row of products.rows || []) {
      await catalogSync.enqueueProductDelete(Number(row.id), client);
    }
    for (const categoryId of categoryIds) {
      await catalogSync.enqueueCategoryDelete(Number(categoryId), client);
    }
  });
}

module.exports = {
  getAllActive,
  getAllActiveTree,
  findByName,
  findById,
  getCategoryFilterIds,
  restoreOrInsert,
  updateCategory,
  moveCategory,
  deactivateCascade,
};
