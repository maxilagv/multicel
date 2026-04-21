const { query } = require('./pg');

const tableCache = new Map();
const columnCache = new Map();

function tableKey(tableName) {
  return String(tableName || '').trim().toLowerCase();
}

function columnKey(tableName, columnName) {
  return `${tableKey(tableName)}::${String(columnName || '').trim().toLowerCase()}`;
}

async function tableExists(tableName, client = null) {
  const key = tableKey(tableName);
  if (!key) return false;
  if (tableCache.has(key)) return tableCache.get(key);
  const runner = client?.query ? client : { query };
  const { rows } = await runner.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = $1
      LIMIT 1`,
    [key]
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  tableCache.set(key, exists);
  return exists;
}

async function columnExists(tableName, columnName, client = null) {
  const key = columnKey(tableName, columnName);
  if (!tableKey(tableName) || !String(columnName || '').trim()) return false;
  if (columnCache.has(key)) return columnCache.get(key);
  const runner = client?.query ? client : { query };
  const { rows } = await runner.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [tableKey(tableName), String(columnName).trim().toLowerCase()]
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  columnCache.set(key, exists);
  return exists;
}

function clearSchemaSupportCache() {
  tableCache.clear();
  columnCache.clear();
}

module.exports = {
  tableExists,
  columnExists,
  clearSchemaSupportCache,
};
