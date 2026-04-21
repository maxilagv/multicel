const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { withTransaction } = require('../db/pg');
const users = require('../db/repositories/userRepository');

const validateSetup = [
  body('nombre').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
];

async function status(req, res) {
  try {
    const hasAdmin = await users.hasAdmin();
    res.json({ requiresSetup: !hasAdmin });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo verificar el estado de setup' });
  }
}

async function createAdmin(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
    const hash = await bcrypt.hash(password, rounds);

    const result = await withTransaction(async (client) => {
      const adminRows = await client.query(
        `SELECT 1
           FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
          WHERE r.nombre = 'admin'
            AND u.activo = 1
          LIMIT 1`
      );
      if (adminRows.rows.length) return { created: false, reason: 'admin_exists' };

      await client.query(
        "INSERT INTO roles(nombre) VALUES ('admin') ON CONFLICT (nombre) DO NOTHING"
      );
      const roleRows = await client.query(
        "SELECT id FROM roles WHERE nombre = 'admin' LIMIT 1"
      );
      const rolId = roleRows.rows[0]?.id;
      if (!rolId) throw new Error('No se pudo resolver rol admin');

      const emailRows = await client.query(
        'SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
      );
      if (emailRows.rows.length) return { created: false, reason: 'email_exists' };

      await client.query(
        'INSERT INTO usuarios(nombre, email, password_hash, rol_id, activo) VALUES ($1, $2, $3, $4, 1)',
        [nombre, email, hash, rolId]
      );
      return { created: true };
    });

    if (!result.created) {
      const msg =
        result.reason === 'email_exists'
          ? 'El email ya esta registrado'
          : 'El setup ya fue completado';
      return res.status(409).json({ error: msg });
    }

    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error('Setup admin error:', e.message);
    return res.status(500).json({ error: 'No se pudo crear el admin' });
  }
}

module.exports = {
  status,
  createAdmin: [...validateSetup, createAdmin],
};
