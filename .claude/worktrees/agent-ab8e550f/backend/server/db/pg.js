const mysql = require('mysql2/promise');
require('dotenv').config();

function parseDatabaseUrl(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/^mysql/i.test(url.protocol || '')) return null;
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: url.pathname ? url.pathname.replace(/^\//, '') : '',
  };
}

function resolveConfig() {
  const fromUrl = parseDatabaseUrl(process.env.DATABASE_URL || process.env.MYSQL_URL);
  return {
    host: fromUrl?.host || process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
    port: fromUrl?.port || Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: fromUrl?.user || process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: fromUrl?.password || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: fromUrl?.database || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'sistema_gestion',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    queueLimit: 0,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    timezone: 'Z',
    multipleStatements: true,
  };
}

let mysqlPool = global._mysqlPool || null;

function ensurePool() {
  if (mysqlPool) return mysqlPool;
  mysqlPool = mysql.createPool(resolveConfig());
  global._mysqlPool = mysqlPool;
  return mysqlPool;
}

function normalizeParam(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object' && !Buffer.isBuffer(value)) return JSON.stringify(value);
  return value;
}

function normalizeParams(params) {
  if (!Array.isArray(params)) return params;
  return params.map((value) => normalizeParam(value));
}

function hasMultipleStatements(sql) {
  const clean = String(sql || '').replace(/--.*$/gm, '').trim();
  if (!clean) return false;
  if (!clean.includes(';')) return false;
  return clean.replace(/;\s*$/, '').includes(';');
}

function rewriteConcatAndDate(sql) {
  let out = String(sql || '');
  out = out.replace(/LOWER\(\s*nombre\s*\|\|\s*' '\s*\|\|\s*COALESCE\(apellido,\s*''\)\s*\)/gi, "LOWER(CONCAT(nombre, ' ', COALESCE(apellido, '')))" );
  out = out.replace(/\$3\s*\|\|\s*substr\(path,\s*\$4\)/gi, 'CONCAT($3, SUBSTRING(path, $4))');
  out = out.replace(/\$3\s*\|\|\s*SUBSTRING\(path,\s*\$4\)/gi, 'CONCAT($3, SUBSTRING(path, $4))');
  out = out.replace(/\bsubstr\(/gi, 'SUBSTRING(');
  out = out.replace(
    /date\(\s*'now'\s*,\s*'-'\s*\|\|\s*\$(\d+)\s*\|\|\s*' days'\s*\)/gi,
    'DATE_SUB(CURDATE(), INTERVAL $$1 DAY)'
  );
  out = out.replace(/date\(\s*'now'\s*\)/gi, 'CURDATE()');
  out = out.replace(
    /date\(\s*COALESCE\(([^)]+)\)\s*,\s*'localtime'\s*\)/gi,
    'DATE(COALESCE($1))'
  );
  out = out.replace(/date\(([^,\)]+),\s*'localtime'\)/gi, 'DATE($1)');
  out = out.replace(/date\(([^,\)]+),\s*'start of month'\)/gi, "DATE_FORMAT($1, '%Y-%m-01')");
  out = out.replace(/date\(([^,\)]+),\s*'\+([0-9]+) day'\)/gi, 'DATE_ADD(DATE($1), INTERVAL $2 DAY)');
  out = out.replace(/date\(([^,\)]+),\s*'-([0-9]+) day'\)/gi, 'DATE_SUB(DATE($1), INTERVAL $2 DAY)');
  return out;
}

function rewriteOnConflict(sql) {
  let out = String(sql || '');
  const conflictDoNothing = /ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+NOTHING/gi;
  if (conflictDoNothing.test(out)) {
    out = out.replace(conflictDoNothing, '');
    out = out.replace(/^\s*INSERT\s+INTO/i, (m) => m.replace(/INSERT\s+INTO/i, 'INSERT IGNORE INTO'));
  }

  const conflictDoUpdate = /ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET\s+([\s\S]*?)(?=(?:\s+RETURNING\b)|\s*$)/i;
  let guard = 0;
  while (guard < 20) {
    const match = out.match(conflictDoUpdate);
    if (!match) break;
    const setClauseRaw = String(match[2] || '').trim();
    const setClause = setClauseRaw.replace(/EXCLUDED\.([a-zA-Z_][a-zA-Z0-9_]*)/g, 'VALUES($1)');
    out = out.replace(match[0], `ON DUPLICATE KEY UPDATE ${setClause}`);
    guard += 1;
  }

  return out;
}

function convertDollarParams(sql, params = []) {
  let outSql = String(sql || '');
  const inputParams = normalizeParams(params || []);
  const mapped = [];

  if (Array.isArray(inputParams) && inputParams.length) {
    outSql = outSql.replace(/\$(\d+)/g, (_match, n) => {
      const idx = Number(n) - 1;
      mapped.push(idx >= 0 && idx < inputParams.length ? inputParams[idx] : null);
      return '?';
    });
  } else {
    outSql = outSql.replace(/\$(\d+)/g, '?');
  }

  return {
    sql: outSql,
    params: mapped.length ? mapped : inputParams,
  };
}

function extractReturning(sql) {
  const trimmed = String(sql || '').replace(/;\s*$/, '');
  const match = trimmed.match(/\sRETURNING\s+([\s\S]+)$/i);
  if (!match) return { sql: trimmed, returning: null };
  const stripped = trimmed.slice(0, match.index).trim();
  return { sql: stripped, returning: String(match[1] || '').trim() };
}

function normalizeSql(text, params = []) {
  let sql = String(text || '').trim();
  sql = sql.replace(/\bILIKE\b/gi, 'LIKE');
  sql = sql.replace(/::[a-zA-Z_][a-zA-Z0-9_]*(\[\])?/g, '');
  sql = rewriteConcatAndDate(sql);
  sql = rewriteOnConflict(sql);

  const hasMany = hasMultipleStatements(sql);
  const { sql: sqlNoReturning, returning } = hasMany ? { sql, returning: null } : extractReturning(sql);
  const converted = convertDollarParams(sqlNoReturning, params);

  return {
    sql: converted.sql,
    params: converted.params,
    returning,
  };
}

function parseTableName(sql, command) {
  const source = String(sql || '');
  let m = null;
  if (command === 'insert') {
    m = source.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+`?([a-zA-Z0-9_]+)`?/i);
  } else if (command === 'update') {
    m = source.match(/UPDATE\s+`?([a-zA-Z0-9_]+)`?/i);
  } else if (command === 'delete') {
    m = source.match(/DELETE\s+FROM\s+`?([a-zA-Z0-9_]+)`?/i);
  }
  const table = m?.[1] || null;
  return /^[a-zA-Z0-9_]+$/.test(String(table || '')) ? table : null;
}

function splitReturningFields(returning) {
  const raw = String(returning || '').trim();
  if (!raw) return [];
  if (raw === '*') return ['*'];
  return raw
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
}

function fieldAlias(field) {
  const asMatch = String(field).match(/\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
  if (asMatch) return asMatch[1];
  const plain = String(field).replace(/[`"']/g, '').trim();
  const dotSplit = plain.split('.');
  return dotSplit[dotSplit.length - 1] || plain;
}

async function selectById(conn, table, id) {
  if (!table || id == null) return null;
  const [rows] = await conn.query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0] || null;
}

async function buildReturningRows(conn, sql, returning, boundParams, packet) {
  const fields = splitReturningFields(returning);
  if (!fields.length) return [];
  const command = String(sql || '').trim().split(/\s+/)[0]?.toLowerCase();
  const table = parseTableName(sql, command);

  if (command === 'insert') {
    const insertId = Number(packet?.insertId || 0) || null;
    if (fields.length === 1 && fields[0] === '*') {
      const row = await selectById(conn, table, insertId);
      if (row) return [row];
    }
    const out = {};
    for (const f of fields) {
      const key = fieldAlias(f);
      if (/^id$/i.test(key)) out[key] = insertId;
      else out[key] = null;
    }
    if (!Object.keys(out).length && insertId != null) return [{ id: insertId }];
    return Object.keys(out).length ? [out] : [];
  }

  if (command === 'update' || command === 'delete') {
    const idGuess = boundParams?.length ? boundParams[boundParams.length - 1] : null;
    if (fields.length === 1 && fields[0] === '*' && command === 'update') {
      const row = await selectById(conn, table, idGuess);
      if (row) return [row];
    }
    const out = {};
    for (const f of fields) {
      const key = fieldAlias(f);
      if (/^id$/i.test(key)) out[key] = idGuess;
      else out[key] = null;
    }
    return Object.keys(out).length ? [out] : [];
  }

  return [];
}

async function queryInternal(conn, text, params) {
  const normalized = normalizeSql(text, params || []);
  const [rawRows] = await conn.query(normalized.sql, normalized.params || []);

  if (Array.isArray(rawRows)) {
    if (rawRows.length && Array.isArray(rawRows[0])) {
      const first = rawRows[0] || [];
      return { rows: first, rowCount: first.length };
    }
    return { rows: rawRows, rowCount: rawRows.length };
  }

  const affected = Number(rawRows?.affectedRows || 0);
  const lastID = Number(rawRows?.insertId || 0);

  if (normalized.returning) {
    const rows = await buildReturningRows(
      conn,
      normalized.sql,
      normalized.returning,
      normalized.params || [],
      rawRows
    );
    return {
      rows,
      rowCount: rows.length || affected,
      lastID,
      changes: affected,
    };
  }

  return {
    rows: [],
    rowCount: affected,
    lastID,
    changes: affected,
  };
}

async function query(text, params) {
  const pool = ensurePool();
  return queryInternal(pool, text, params);
}

function createClient(conn) {
  return {
    query: (text, params) => queryInternal(conn, text, params),
    release: () => {
      if (typeof conn.release === 'function') conn.release();
    },
  };
}

async function withTransaction(fn) {
  const pool = ensurePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const client = createClient(conn);
    const result = await fn(client);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      // ignore rollback errors
    }
    throw err;
  } finally {
    conn.release();
  }
}

const pool = {
  query: (text, params) => query(text, params),
  async connect() {
    const p = ensurePool();
    const conn = await p.getConnection();
    return createClient(conn);
  },
  async end() {
    if (mysqlPool) {
      await mysqlPool.end();
      mysqlPool = null;
      global._mysqlPool = null;
    }
  },
  async reconnect() {
    await this.end();
    ensurePool();
  },
};

async function backupTo() {
  throw new Error('Los backups de archivo local no estan soportados en modo cloud');
}

async function restoreFrom() {
  throw new Error('La restauracion de archivo local no esta soportada en modo cloud');
}

module.exports = {
  pool,
  query,
  withTransaction,
  backupTo,
  restoreFrom,
  dbPath: null,
};
