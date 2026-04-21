#!/usr/bin/env node
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pg');

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD_PLAIN;
  const name = process.argv[4] || process.env.ADMIN_NAME || 'Administrador';
  if (!email || !password) {
    console.error('Uso: node scripts/bootstrap-admin.js <email> <password> [Nombre]');
    process.exit(1);
  }
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  const hash = await bcrypt.hash(password, rounds);
  try {
    await pool.query('BEGIN');
    // Ensure role admin exists
    const role = await pool.query("INSERT INTO roles(nombre) VALUES ('admin') ON CONFLICT (nombre) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id");
    const rolId = role.rows[0].id;
    const existing = await pool.query('SELECT id FROM usuarios WHERE LOWER(email)=LOWER($1)', [email]);
    if (existing.rowCount) {
      await pool.query('UPDATE usuarios SET nombre=$1, password_hash=$2, rol_id=$3, activo=TRUE WHERE id=$4', [name, hash, rolId, existing.rows[0].id]);
      console.log('Usuario admin actualizado');
    } else {
      await pool.query('INSERT INTO usuarios(nombre, email, password_hash, rol_id, activo) VALUES ($1, $2, $3, $4, TRUE)', [name, email, hash, rolId]);
      console.log('Usuario admin creado');
    }
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

