const mysql = require('mysql2/promise');
require('dotenv').config();

const DEFAULT_POOL_SIZE = 10;
const DEFAULT_POOL_MAX_IDLE = 10;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_POOL_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_POOL_ACQUIRE_TIMEOUT_MS = 30_000;

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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
  const connectionLimit = toPositiveNumber(process.env.DB_POOL_SIZE, DEFAULT_POOL_SIZE);
  return {
    host: fromUrl?.host || process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
    port: fromUrl?.port || Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: fromUrl?.user || process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: fromUrl?.password || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: fromUrl?.database || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'sistema_gestion',
    waitForConnections: true,
    connectionLimit,
    maxIdle: toPositiveNumber(process.env.DB_POOL_MAX_IDLE, connectionLimit || DEFAULT_POOL_MAX_IDLE),
    idleTimeout: toPositiveNumber(
      process.env.DB_POOL_IDLE_TIMEOUT_MS,
      DEFAULT_POOL_IDLE_TIMEOUT_MS
    ),
    queueLimit: 0,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    timezone: 'Z',
    enableKeepAlive: process.env.DB_KEEPALIVE !== 'false',
    keepAliveInitialDelay: toPositiveNumber(
      process.env.DB_KEEPALIVE_INITIAL_DELAY_MS,
      10_000
    ),
    connectTimeout: toPositiveNumber(
      process.env.DB_CONNECT_TIMEOUT_MS,
      DEFAULT_POOL_CONNECT_TIMEOUT_MS
    ),
    multipleStatements: true,
  };
}

function resolveAcquireTimeoutMs() {
  return toPositiveNumber(
    process.env.DB_ACQUIRE_TIMEOUT_MS,
    DEFAULT_POOL_ACQUIRE_TIMEOUT_MS
  );
}

let mysqlPool = global._mysqlPool || null;
let poolMetadata = global._mysqlPoolMetadata || null;

function attachPoolMetadata(pool) {
  const metadata = {
    created_at: new Date().toISOString(),
    acquire_timeout_ms: resolveAcquireTimeoutMs(),
  };

  if (typeof pool?.on === 'function') {
    pool.on('connection', () => {
      metadata.last_connection_at = new Date().toISOString();
    });
    pool.on('acquire', () => {
      metadata.last_acquire_at = new Date().toISOString();
    });
    pool.on('release', () => {
      metadata.last_release_at = new Date().toISOString();
    });
    pool.on('enqueue', () => {
      metadata.last_enqueue_at = new Date().toISOString();
    });
  }

  poolMetadata = metadata;
  global._mysqlPoolMetadata = metadata;
}

function ensurePool() {
  if (mysqlPool) return mysqlPool;
  mysqlPool = mysql.createPool(resolveConfig());
  global._mysqlPool = mysqlPool;
  attachPoolMetadata(mysqlPool);
  return mysqlPool;
}

function getRawPool(pool) {
  return pool?.pool || pool || null;
}

function getPoolStats() {
  const pool = ensurePool();
  const rawPool = getRawPool(pool);
  const cfg = pool.config || rawPool?.config || {};

  return {
    created_at: poolMetadata?.created_at || null,
    last_connection_at: poolMetadata?.last_connection_at || null,
    last_acquire_at: poolMetadata?.last_acquire_at || null,
    last_release_at: poolMetadata?.last_release_at || null,
    last_enqueue_at: poolMetadata?.last_enqueue_at || null,
    acquire_timeout_ms: poolMetadata?.acquire_timeout_ms || resolveAcquireTimeoutMs(),
    wait_for_connections: Boolean(cfg.waitForConnections),
    connection_limit: Number(cfg.connectionLimit || cfg.connection_limit || 0),
    queue_limit: Number(cfg.queueLimit || cfg.queue_limit || 0),
    max_idle: Number(cfg.maxIdle || cfg.max_idle || 0),
    idle_timeout_ms: Number(cfg.idleTimeout || cfg.idle_timeout || 0),
    open_connections: Array.isArray(rawPool?._allConnections)
      ? rawPool._allConnections.length
      : null,
    idle_connections: Array.isArray(rawPool?._freeConnections)
      ? rawPool._freeConnections.length
      : null,
    queued_requests: Array.isArray(rawPool?._connectionQueue)
      ? rawPool._connectionQueue.length
      : null,
  };
}

async function getConnectionWithTimeout(pool) {
  const acquireTimeoutMs = resolveAcquireTimeoutMs();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(
        new Error(
          `DB acquire timeout after ${acquireTimeoutMs}ms; no connection available in pool`
        )
      );
    }, acquireTimeoutMs);

    pool
      .getConnection()
      .then((conn) => {
        if (settled) {
          conn.release();
          return;
        }
        clearTimeout(timer);
        settled = true;
        resolve(conn);
      })
      .catch((err) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        reject(err);
      });
  });
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
  const affected = Number(packet?.affectedRows || 0);

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
    if (affected <= 0) return [];
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
  const conn = await getConnectionWithTimeout(pool);
  try {
    return await queryInternal(conn, text, params);
  } finally {
    conn.release();
  }
}

async function ping() {
  await query('SELECT 1 AS ok');
  return true;
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
  const conn = await getConnectionWithTimeout(pool);
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
    const conn = await getConnectionWithTimeout(p);
    return createClient(conn);
  },
  async end() {
    if (mysqlPool) {
      await mysqlPool.end();
      mysqlPool = null;
      global._mysqlPool = null;
      poolMetadata = null;
      global._mysqlPoolMetadata = null;
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
  ping,
  getPoolStats,
  backupTo,
  restoreFrom,
  dbPath: null,
  __test__: {
    splitReturningFields,
    fieldAlias,
    buildReturningRows,
  },
};
