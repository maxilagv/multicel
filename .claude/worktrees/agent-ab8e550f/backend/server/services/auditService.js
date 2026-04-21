const { query } = require('../db/pg');

async function log({ usuario_id = null, accion, tabla_afectada, registro_id = null, descripcion = null }) {
  try {
    await query(
      `INSERT INTO logs(usuario_id, accion, tabla_afectada, registro_id, descripcion)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuario_id, accion, tabla_afectada, registro_id, descripcion]
    );
  } catch (e) {
    // No romper flujo por fallo de logging
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[audit] log failed:', e.message);
    }
  }
}

module.exports = { log };

