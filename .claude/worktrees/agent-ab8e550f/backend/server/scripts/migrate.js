#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('../db/pg');

function parseMigrationFilename(filename) {
  const match = /^V(\d+)__([\w\-]+)\.sql$/.exec(filename);
  if (!match) return null;
  return {
    version: match[1],
    name: match[2],
    filename,
  };
}

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedVersions() {
  const { rows } = await pool.query('SELECT version FROM _migrations');
  return new Set(rows.map((row) => String(row.version)));
}

async function run() {
  const defaultDir = path.resolve(__dirname, '../../database/migrations_mysql');
  const dir = process.env.DB_MIGRATIONS_DIR || defaultDir;
  const abs = path.resolve(dir);

  if (!fs.existsSync(abs)) {
    throw new Error(`Migration dir not found: ${abs}`);
  }

  await ensureMigrationsTable();
  const applied = await getAppliedVersions();

  const files = fs
    .readdirSync(abs)
    .map(parseMigrationFilename)
    .filter(Boolean)
    .sort((a, b) => Number(a.version) - Number(b.version));

  for (const migration of files) {
    if (applied.has(migration.version)) {
      if (require.main === module) {
        console.log(`SKIP V${migration.version}__${migration.name}`);
      }
      continue;
    }

    const sql = fs.readFileSync(path.join(abs, migration.filename), 'utf8');
    if (require.main === module) {
      console.log(`APPLY V${migration.version}__${migration.name}`);
    }

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO _migrations(version, name) VALUES ($1, $2)',
        [migration.version, migration.name]
      );
    });
  }

  if (require.main === module) {
    console.log('Migraciones MySQL aplicadas.');
    await pool.end();
  }
}

if (require.main === module) {
  run().catch(async (err) => {
    console.error(err?.message || err);
    try {
      await pool.end();
    } catch (_) {
      // ignore close errors
    }
    process.exit(1);
  });
}

module.exports = { run };
