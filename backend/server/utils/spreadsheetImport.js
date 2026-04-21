const path = require('path');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function extractCellValue(cell) {
  if (!cell) return '';
  const value = cell.value;
  if (value === null || typeof value === 'undefined') return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text || '').join('');
    }
    if (typeof value.result !== 'undefined') return value.result;
    if (typeof value.hyperlink === 'string') return value.text || value.hyperlink;
  }
  return value;
}

function parseNumber(raw) {
  if (raw === null || typeof raw === 'undefined') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const rawStr = String(raw).trim();
  if (!rawStr) return null;

  let normalized = rawStr.replace(/[^\d,.\-]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    const parts = normalized.split(',');
    if (parts.length === 2 && parts[1].length <= 3) {
      normalized = `${parts[0].replace(/\./g, '')}.${parts[1]}`;
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (lastDot > -1) {
    const parts = normalized.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      normalized = normalized.replace(/\./g, '');
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadWorksheet(file) {
  const workbook = new ExcelJS.Workbook();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const isCsv = ext === '.csv' || mime.includes('csv') || mime === 'text/plain';

  if (isCsv) {
    const stream = Readable.from(file.buffer);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(file.buffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No se encontro una hoja en el archivo');
  }
  return worksheet;
}

function buildHeaderLookup(aliases) {
  const map = new Map();
  for (const [field, values] of Object.entries(aliases || {})) {
    for (const alias of values || []) {
      map.set(normalizeHeader(alias), field);
    }
  }
  return map;
}

function buildColumnMap(row, headerLookup) {
  const map = {};
  const maxCol = Math.max(row?.cellCount || 0, row?.actualCellCount || 0);
  for (let col = 1; col <= maxCol; col += 1) {
    const raw = extractCellValue(row.getCell(col));
    const normalized = normalizeHeader(raw);
    if (!normalized) continue;
    const field = headerLookup.get(normalized);
    if (field && !map[field]) {
      map[field] = col;
    }
  }
  return map;
}

function scoreColumnMap(map, required = []) {
  let score = 0;
  for (const field of required) {
    if (map[field]) score += 2;
  }
  score += Object.keys(map || {}).length;
  return score;
}

function findHeaderRow(worksheet, headerLookup, required = []) {
  const maxScan = Math.min(10, worksheet?.rowCount || 1);
  let best = { rowIndex: 1, map: {}, score: 0 };
  for (let index = 1; index <= maxScan; index += 1) {
    const row = worksheet.getRow(index);
    if (!row || row.actualCellCount === 0) continue;
    const map = buildColumnMap(row, headerLookup);
    const score = scoreColumnMap(map, required);
    if (score > best.score) {
      best = { rowIndex: index, map, score };
    }
  }
  return best;
}

module.exports = {
  buildColumnMap,
  buildHeaderLookup,
  extractCellValue,
  findHeaderRow,
  loadWorksheet,
  normalizeHeader,
  normalizeText,
  parseNumber,
};
