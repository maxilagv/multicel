const { query } = require('../../db/pg');

function normalizeJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    visibility_roles: normalizeJsonArray(row.visibility_roles),
  };
}

async function listByEntity(entityType, entityId, { soloActivos = true } = {}) {
  const params = [entityType, Number(entityId)];
  const where = ['entity_type = $1', 'entity_id = $2'];
  if (soloActivos) where.push('activo = TRUE');

  const { rows } = await query(
    `SELECT id,
            entity_type,
            entity_id,
            storage_provider,
            resource_type,
            nombre_archivo,
            url_archivo,
            mime_type,
            extension,
            size_bytes,
            descripcion,
            visibility_scope,
            visibility_roles,
            uploaded_by,
            created_at,
            updated_at
       FROM app_adjuntos
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC`,
    params
  );

  return rows.map(normalizeRow);
}

async function getById(id) {
  const { rows } = await query(
    `SELECT id,
            entity_type,
            entity_id,
            storage_provider,
            resource_type,
            nombre_archivo,
            url_archivo,
            mime_type,
            extension,
            size_bytes,
            descripcion,
            visibility_scope,
            visibility_roles,
            uploaded_by,
            activo,
            created_at,
            updated_at
       FROM app_adjuntos
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return normalizeRow(rows[0] || null);
}

async function create({
  entity_type,
  entity_id,
  storage_provider = 'external_url',
  resource_type = 'raw',
  nombre_archivo,
  url_archivo,
  mime_type,
  extension,
  size_bytes,
  descripcion,
  visibility_scope = 'private',
  visibility_roles = [],
  uploaded_by,
}) {
  const { rows } = await query(
    `INSERT INTO app_adjuntos(
       entity_type,
       entity_id,
       storage_provider,
       resource_type,
       nombre_archivo,
       url_archivo,
       mime_type,
       extension,
       size_bytes,
       descripcion,
       visibility_scope,
       visibility_roles,
       uploaded_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      entity_type,
      Number(entity_id),
      storage_provider,
      resource_type,
      nombre_archivo,
      url_archivo,
      mime_type || null,
      extension || null,
      size_bytes != null ? Number(size_bytes) : null,
      descripcion || null,
      visibility_scope,
      visibility_roles,
      uploaded_by || null,
    ]
  );
  return getById(rows[0]?.id);
}

async function remove(id) {
  const { rows } = await query(
    `UPDATE app_adjuntos
        SET activo = FALSE
      WHERE id = $1
      RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  listByEntity,
  getById,
  create,
  remove,
};
