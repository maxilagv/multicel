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

const MODEL_HEADER_ALIASES = new Set([
  'modelo',
  'model',
  'producto',
  'producto_modelo',
  'nombre_modelo',
  'modelo_producto',
]);

const POSITIVE_MARKERS = new Set([
  'x',
  'si',
  's',
  'ok',
  '1',
  'true',
  'yes',
  'y',
  'stock',
  'disponible',
]);

const NEGATIVE_MARKERS = new Set([
  '0',
  'no',
  'n',
  '-',
  'false',
]);

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

function isExplicitMatrixMarker(value) {
  if (value === null || typeof value === 'undefined') return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return true;
  return normalizeText(value) !== '';
}

function shouldIncludeCell(value) {
  if (value === null || typeof value === 'undefined') return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;

  const text = normalizeText(value);
  if (!text) return false;

  const token = normalizeHeader(text);
  if (NEGATIVE_MARKERS.has(token)) return false;
  if (POSITIVE_MARKERS.has(token)) return true;

  const num = parseNumber(text);
  if (num !== null) return num > 0;

  return true;
}

function getNonEmptyHeaderCells(row, startColumn = 2) {
  const maxCol = Math.max(row?.cellCount || 0, row?.actualCellCount || 0);
  const headers = [];

  for (let col = startColumn; col <= maxCol; col += 1) {
    const label = normalizeText(extractCellValue(row.getCell(col)));
    if (!label) continue;
    headers.push({ col, label });
  }

  return headers;
}

function resolveBrandFromModel(modelName) {
  const source = normalizeText(modelName);
  if (!source) return null;

  const upper = source.toUpperCase();

  if (upper.includes('IPHONE')) return 'iPhone';
  if (upper.includes('REDMI')) return 'Redmi';
  if (upper.includes('POCO')) return 'Poco';
  if (upper.includes('XIAOMI') || upper.includes('XIAIOMI')) return 'Xiaomi';
  if (upper.includes('NUBIA')) return 'Nubia';
  if (upper.includes('INFINIX')) return 'Infinix';
  if (upper.includes('OPPO')) return 'Oppo';
  if (upper.includes('REALME')) return 'Realme';
  if (upper.includes('TECNO')) return 'Tecno';
  if (upper.includes('ZTE') || upper.includes('BLADE')) return 'ZTE';
  if (upper.includes('TCL')) return 'TCL';
  if (upper.includes('HUAWEI')) return 'Huawei';
  if (upper.includes('HONOR')) return 'Honor';

  if (
    upper.startsWith('EDGE') ||
    upper.startsWith('MOTO') ||
    /^[EG]\d/.test(upper)
  ) {
    return 'Motorola';
  }

  if (
    /^[ASJMF]\d/.test(upper) ||
    upper.startsWith('NOTE ') ||
    upper.startsWith('Z FLIP') ||
    upper.startsWith('Z FOLD')
  ) {
    return 'Samsung';
  }

  return null;
}

function detectProductCategoryMatrix(worksheet) {
  const maxScan = Math.min(5, Number(worksheet?.rowCount || 0));

  for (let rowIndex = 1; rowIndex <= maxScan; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    if (!row || row.actualCellCount === 0) continue;

    const firstCell = normalizeHeader(extractCellValue(row.getCell(1)));
    if (!MODEL_HEADER_ALIASES.has(firstCell)) continue;

    const variants = getNonEmptyHeaderCells(row, 2);
    if (!variants.length) continue;

    let modelRows = 0;
    let explicitMarkers = 0;
    const lastRow = Number(worksheet?.rowCount || 0);

    for (let dataRowIndex = rowIndex + 1; dataRowIndex <= lastRow; dataRowIndex += 1) {
      const dataRow = worksheet.getRow(dataRowIndex);
      const modelName = normalizeText(extractCellValue(dataRow.getCell(1)));
      if (!modelName) continue;
      modelRows += 1;
      for (const variant of variants) {
        const cellValue = extractCellValue(dataRow.getCell(variant.col));
        if (isExplicitMatrixMarker(cellValue)) {
          explicitMarkers += 1;
        }
      }
    }

    if (!modelRows) continue;

    return {
      headerRowIndex: rowIndex,
      variants,
      modelColumn: 1,
      explicitMarkers,
      fullCrossMode: explicitMarkers === 0,
    };
  }

  return null;
}

function extractProductCategoryMatrixRows(worksheet, { rootCategory } = {}) {
  const matrix = detectProductCategoryMatrix(worksheet);
  const root = normalizeText(rootCategory);

  if (!matrix || !root) return [];

  const items = [];
  const lastRow = Number(worksheet?.rowCount || 0);

  for (let rowIndex = matrix.headerRowIndex + 1; rowIndex <= lastRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const modelName = normalizeText(extractCellValue(row.getCell(matrix.modelColumn)));
    if (!modelName) continue;
    const brand = resolveBrandFromModel(modelName);

    for (const variant of matrix.variants) {
      const marker = extractCellValue(row.getCell(variant.col));
      if (!matrix.fullCrossMode && !shouldIncludeCell(marker)) {
        continue;
      }

      items.push({
        rowIndex,
        name: modelName,
        modelo: modelName,
        brand,
        brandError: brand ? null : `No se pudo inferir la marca para "${modelName}"`,
        categoryPath: brand ? [root, brand, variant.label] : [root, variant.label],
        price: 0,
        allowZeroPrice: true,
      });
    }
  }

  return items;
}

module.exports = {
  detectProductCategoryMatrix,
  extractProductCategoryMatrixRows,
  resolveBrandFromModel,
};
