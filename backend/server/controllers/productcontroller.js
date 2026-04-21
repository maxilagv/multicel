const { body, check, validationResult } = require('express-validator');
const path = require('path');
const logger = require('../lib/logger');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const repo = require('../db/repositories/productRepository');
const categoryRepo = require('../db/repositories/categoryRepository');
const priceListRepo = require('../db/repositories/priceListRepository');
const pricingRepo = require('../db/repositories/pricingRepository');
const importJobs = require('../services/importJobService');
const { extractProductCategoryMatrixRows } = require('../utils/productMatrixImport');
const configRepo = require('../db/repositories/configRepository');
const { buildSupplierOrderPdf } = require('../services/supplierOrderPdfService');
const supplierRepo = require('../db/repositories/supplierRepository');
const {
  canViewSensitiveProductData,
  getRequestRole,
  resolveScopedDepositoId,
} = require('../lib/depositoScope');

const HEADER_ALIASES = {
  name: [
    'nombre',
    'name',
    'producto',
    'product',
    'item',
    'producto_nombre',
    'nombre_producto',
    'nombre_del_producto',
    'nombre_de_producto',
    'articulo',
  ],
  category: ['categoria', 'category', 'rubro', 'grupo', 'familia'],
  category_path: ['categoria_path', 'category_path', 'ruta_categoria', 'ruta category', 'categoria_ruta'],
  category_id: ['categoria_id', 'category_id', 'id_categoria', 'idcategory'],
  codigo: ['codigo', 'sku', 'code', 'barcode', 'cod'],
  description: ['descripcion', 'description', 'detalle', 'desc'],
  price: ['precio', 'precio_venta', 'price', 'precio venta', 'precio venta base'],
  precio_final: ['precio_final', 'precio final', 'final'],
  costo_pesos: ['costo_pesos', 'costo pesos', 'precio_costo_pesos', 'costo_ars', 'costo ars', 'costo'],
  costo_dolares: ['costo_dolares', 'costo dolares', 'precio_costo_dolares', 'costo_usd', 'costo usd'],
  tipo_cambio: ['tipo_cambio', 'tipo cambio', 'tc', 'exchange_rate'],
  margen_local: ['margen_local', 'margen local', 'margen', 'markup'],
  margen_distribuidor: ['margen_distribuidor', 'margen distribuidor', 'margen mayorista'],
  stock_quantity: ['stock', 'stock_inicial', 'cantidad', 'cantidad_inicial', 'inventario', 'stock_quantity'],
  image_url: ['image_url', 'imagen', 'imagen_url', 'image', 'foto', 'url_imagen'],
  marca: ['marca', 'brand'],
  modelo: ['modelo', 'model'],
  procesador: ['procesador', 'cpu', 'processor'],
  ram_gb: ['ram', 'ram_gb', 'ram gb'],
  almacenamiento_gb: ['almacenamiento', 'almacenamiento_gb', 'storage', 'storage_gb'],
  pantalla_pulgadas: ['pantalla', 'pantalla_pulgadas', 'screen', 'screen_inches'],
  camara_mp: ['camara', 'camara_mp', 'camera', 'camera_mp'],
  bateria_mah: ['bateria', 'bateria_mah', 'battery', 'battery_mah'],
};

const PRODUCT_IMPORT_ASYNC_THRESHOLD = 250;

const HEADER_LOOKUP = (() => {
  const map = new Map();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      map.set(normalizeHeader(alias), key);
    }
  }
  return map;
})();

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

function parseCategoryPath(raw) {
  const source = normalizeText(raw);
  if (!source) return [];
  const parts = source
    .split(/\s*(?:>|\/|\\|\|)\s*/g)
    .map((p) => normalizeText(p))
    .filter(Boolean);
  if (!parts.length) return [source];
  return parts;
}

function cleanHeading(text) {
  return normalizeText(text).replace(/[:.]+$/g, '');
}

function isNoiseHeading(text) {
  const norm = normalizeHeader(text);
  return (
    norm === 'productos' ||
    norm === 'imagenes' ||
    norm === 'imagenes_de_los_productos' ||
    norm === 'imagenes_de_productos'
  );
}

function extractCellValue(cell) {
  if (!cell) return '';
  const value = cell.value;
  if (value === null || typeof value === 'undefined') return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.richText)) {
      return value.richText.map((v) => v.text || '').join('');
    }
    if (typeof value.result !== 'undefined') return value.result;
    if (typeof value.formula === 'string' && typeof value.result !== 'undefined') return value.result;
    if (typeof value.hyperlink === 'string') return value.text || value.hyperlink;
  }
  return value;
}

function parseNumber(raw) {
  if (raw === null || typeof raw === 'undefined') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const rawStr = String(raw).trim();
  if (!rawStr) return null;
  let s = rawStr.replace(/[^\d,.\-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 3) {
      s = `${parts[0].replace(/\./g, '')}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastDot > -1) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      s = s.replace(/\./g, '');
    }
  } else {
    s = s.replace(/,/g, '');
  }
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function normalizeMargin(raw) {
  const num = parseNumber(raw);
  if (num === null) return null;
  return num > 1 ? num / 100 : num;
}

function normalizeOptionalImageUrl(value) {
  if (typeof value === 'undefined') return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

async function loadWorksheet(file) {
  const workbook = new ExcelJS.Workbook();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const isCsv =
    ext === '.csv' ||
    String(file.mimetype || '').toLowerCase().includes('csv') ||
    String(file.mimetype || '').toLowerCase() === 'text/plain';
  if (isCsv) {
    const stream = Readable.from(file.buffer);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(file.buffer);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No se encontró una hoja en el archivo');
  }
  return worksheet;
}

function buildColumnMap(headerRow) {
  const map = {};
  const maxCol = Math.max(headerRow.cellCount || 0, headerRow.actualCellCount || 0);
  for (let col = 1; col <= maxCol; col += 1) {
    const raw = extractCellValue(headerRow.getCell(col));
    const normalized = normalizeHeader(raw);
    if (!normalized) continue;
    const field = HEADER_LOOKUP.get(normalized);
    if (field && !map[field]) {
      map[field] = col;
    }
  }
  return map;
}

function scoreColumnMap(map) {
  let score = 0;
  if (map.name) score += 2;
  if (map.category || map.category_path || map.category_id) score += 2;
  if (map.price) score += 1;
  if (map.costo_pesos || map.costo_dolares) score += 1;
  return score;
}

function findHeaderRow(worksheet) {
  const maxScan = Math.min(10, worksheet.rowCount || 1);
  let best = { rowIndex: 1, map: {}, score: 0 };
  for (let i = 1; i <= maxScan; i += 1) {
    const row = worksheet.getRow(i);
    if (!row || row.actualCellCount === 0) continue;
    const map = buildColumnMap(row);
    const score = scoreColumnMap(map);
    if (score > best.score) {
      best = { rowIndex: i, map, score };
    }
  }
  return best;
}

function extractFallbackRows(worksheet, { fallbackCategory }) {
  const items = [];
  let currentCategory = fallbackCategory || null;
  let pendingName = null;

  const lastRow = worksheet.rowCount || 0;
  for (let rowIndex = 1; rowIndex <= lastRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    if (!row || row.actualCellCount === 0) continue;

    const texts = [];
    let hasLetters = false;
    let priceCandidate = null;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = extractCellValue(cell);
      if (raw === null || typeof raw === 'undefined') return;
      const rawStr = String(raw).trim();
      if (!rawStr) return;
      const num = parseNumber(rawStr);
      if (num != null && num > 0 && priceCandidate == null) {
        priceCandidate = num;
      }
      if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(rawStr)) {
        hasLetters = true;
        texts.push(rawStr);
      } else if (num == null) {
        texts.push(rawStr);
      }
    });

    const text = normalizeText(texts.join(' '));
    if (!text && priceCandidate == null) continue;

    const headingType = !priceCandidate
      ? (() => {
          if (!text) return null;
          if (isNoiseHeading(text)) return 'noise';
          const clean = cleanHeading(text);
          const upper = clean === clean.toUpperCase();
          const wordCount = clean.split(' ').length;
          if (upper && wordCount <= 8) return 'category';
          if (/[:.]$/.test(text) && wordCount <= 8) return 'category';
          return null;
        })()
      : null;

    if (headingType === 'noise') {
      pendingName = null;
      continue;
    }
    if (headingType === 'category') {
      currentCategory = cleanHeading(text);
      pendingName = null;
      continue;
    }

    if (hasLetters && priceCandidate != null) {
      items.push({
        rowIndex,
        name: text,
        price: priceCandidate,
        category: currentCategory,
      });
      pendingName = null;
      continue;
    }

    if (hasLetters && priceCandidate == null) {
      pendingName = { rowIndex, name: text };
      continue;
    }

    if (!hasLetters && priceCandidate != null) {
      if (pendingName) {
        items.push({
          rowIndex: pendingName.rowIndex,
          name: pendingName.name,
          price: priceCandidate,
          category: currentCategory,
        });
        pendingName = null;
      }
    }
  }

  return items;
}

async function getProducts(req, res) {
  try {
    const { category_id, page, limit, sort, dir, all, include_descendants, tipo, stock_filter } = req.query || {};
    const rawSearch = (req.query.search || req.query.q || '').toString().trim();
    const q = rawSearch || undefined;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const allowAll = String(all || '') === '1';
    const includeDescendants =
      String(include_descendants || '').toLowerCase() === '1' ||
      String(include_descendants || '').toLowerCase() === 'true';
    const maxLimit = allowAll ? 10000 : 200;
    const defaultLimit = allowAll ? maxLimit : 50;
    const perPage = Math.min(Math.max(parseInt(limit, 10) || defaultLimit, 1), maxLimit);
    const validTipos = ['estandar', 'insumo', 'servicio'];
    const validStockFilters = ['nulo', 'bajo', 'ambos'];
    const role = getRequestRole(req);
    const depositoId = req.user
      ? await resolveScopedDepositoId(req, req.query?.deposito_id, {
          preferSingle: false,
        })
      : null;
    const includeSensitive = canViewSensitiveProductData(role);
    const { rows, total } = await repo.listProductsPaginated({
      q,
      categoryId: category_id,
      includeDescendants,
      page: pageNum,
      limit: perPage,
      sort,
      dir,
      allowAll,
      tipo: validTipos.includes(tipo) ? tipo : undefined,
      stockFilter: validStockFilters.includes(stock_filter) ? stock_filter : undefined,
      depositoId: depositoId || null,
    });
    // Ensure response shape compatibility (add missing keys if needed)
    const mapped = rows.map((r) => ({
      id: r.id,
      category_id: r.category_id,
      name: r.name,
      codigo: r.codigo,
      description: r.description,
      tipo_producto: r.tipo_producto || 'estandar',
      price: r.price,
      image_url: r.image_url || null,
      category_name: r.category_name,
      category_path: r.category_path || null,
      stock_quantity: r.stock_quantity,
      stock_minimo: r.stock_minimo ?? 0,
      precio_modo: r.precio_modo,
      price_local: r.price_local,
      price_distribuidor: r.price_distribuidor,
      precio_final: r.precio_final,
      marca: r.marca,
      modelo: r.modelo,
      procesador: r.procesador,
      ram_gb: r.ram_gb,
      almacenamiento_gb: r.almacenamiento_gb,
      pantalla_pulgadas: r.pantalla_pulgadas,
      camara_mp: r.camara_mp,
      bateria_mah: r.bateria_mah,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at || null,
      ...(includeSensitive
        ? {
            costo_pesos: r.costo_pesos,
            costo_dolares: r.costo_dolares,
            tipo_cambio: r.tipo_cambio,
            margen_local: r.margen_local,
            margen_distribuidor: r.margen_distribuidor,
            comision_pct: r.comision_pct,
          }
        : {}),
    }));
    const totalPages = perPage > 0 ? Math.max(1, Math.ceil((total || 0) / perPage)) : 1;
    res.json({ data: mapped, total, page: pageNum, totalPages });
  } catch (err) {
    logger.error({ err: err }, 'Error en getProducts:');
    res.status(500).json({ error: 'Failed to fetch products' });
  }
}

// Validation (payload en inglés para compatibilidad)
const validateProduct = [
  check('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 chars'),
  check('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must be at most 500 chars'),
  check('price')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Price must be a positive number'),
  check('codigo')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('codigo must be 3-50 chars')
    .isString().withMessage('codigo must be a string'),
  check('image_url')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isString().withMessage('Image URL must be a string'),
  check('category_id')
    .notEmpty().withMessage('category_id is required')
    .isInt({ min: 1 }).withMessage('category_id must be an integer >= 1'),
  check('stock_quantity')
    .optional()
    .isInt({ min: 0 }).withMessage('stock_quantity must be an integer >= 0'),
  check('specifications')
    .optional()
    .isString().withMessage('specifications must be a string'),
  check('precio_costo_pesos')
    .optional()
    .isFloat({ min: 0 }).withMessage('precio_costo_pesos must be a positive number or zero'),
  check('precio_costo_dolares')
    .optional()
    .isFloat({ min: 0 }).withMessage('precio_costo_dolares must be a positive number or zero'),
  check('tipo_cambio')
    .optional({ nullable: true })
    .isFloat({ gt: 0 }).withMessage('tipo_cambio must be > 0'),
  check('margen_local')
    .optional()
    .isFloat({ min: 0 }).withMessage('margen_local must be >= 0'),
  check('margen_distribuidor')
    .optional()
    .isFloat({ min: 0 }).withMessage('margen_distribuidor must be >= 0'),
  check('precio_modo')
    .optional()
    .isIn(['auto', 'manual'])
    .withMessage('precio_modo must be auto or manual'),
  check('price_local')
    .optional()
    .isFloat({ min: 0 }).withMessage('price_local must be >= 0'),
  check('price_distribuidor')
    .optional()
    .isFloat({ min: 0 }).withMessage('price_distribuidor must be >= 0'),
  check('comision_pct')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('comision_pct must be between 0 and 100'),
  check('proveedor_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('proveedor_id must be an integer >= 1'),
  check('precio_final')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('Precio final debe ser un número positivo'),
  check('marca').optional().isString().isLength({ max: 120 }),
  check('modelo').optional().isString().isLength({ max: 120 }),
  check('procesador').optional().isString().isLength({ max: 120 }),
  check('ram_gb').optional().isInt({ min: 0 }),
  check('almacenamiento_gb').optional().isInt({ min: 0 }),
  check('pantalla_pulgadas').optional().isFloat({ min: 0 }),
  check('camara_mp').optional().isInt({ min: 0 }),
  check('bateria_mah').optional().isInt({ min: 0 }),
];

async function createProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error('ValidaciÃ³n fallida en createProduct:', errors.array(), { body: req.body });
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    name,
    description,
    price,
    codigo,
    image_url,
    category_id,
    stock_quantity,
    precio_costo_pesos,
    precio_costo_dolares,
    tipo_cambio,
    margen_local,
    margen_distribuidor,
    comision_pct,
    precio_modo,
    price_local,
    price_distribuidor,
    proveedor_id,
    precio_final,
    marca,
    modelo,
    procesador,
    ram_gb,
    almacenamiento_gb,
    pantalla_pulgadas,
    camara_mp,
    bateria_mah,
    tipo_producto,
  } = req.body;
  const normalizedImageUrl = normalizeOptionalImageUrl(image_url);

  try {
    const result = await repo.createProduct({
      name,
      description,
      price,
      codigo,
      image_url: normalizedImageUrl,
      category_id: Number(category_id),
      stock_quantity,
      precio_costo_pesos,
      precio_costo_dolares,
      tipo_cambio,
      margen_local,
      margen_distribuidor,
      comision_pct,
      precio_modo,
      price_local,
      price_distribuidor,
      proveedor_id,
      precio_final,
      marca,
      modelo,
      procesador,
      ram_gb,
      almacenamiento_gb,
      pantalla_pulgadas,
      camara_mp,
      bateria_mah,
      tipo_producto,
    });
    res.status(201).json({ id: result.id });
  } catch (err) {
    const code = err.status || 500;
    if (code === 400) {
      logger.error({ err: err.message, body: req.body }, 'Bad request creating product:');
      return res.status(400).json({ error: err.message });
    }
    logger.error({ err, body: req.body }, 'Error creating product:');
    res.status(500).json({ error: 'Failed to create product' });
  }
}

async function updateProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error('ValidaciÃ³n fallida en updateProduct:', errors.array(), { body: req.body });
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const {
    name,
    description,
    price,
    codigo,
    image_url,
    category_id,
    stock_quantity,
    precio_costo_pesos,
    precio_costo_dolares,
    tipo_cambio,
    margen_local,
    margen_distribuidor,
    comision_pct,
    precio_modo,
    price_local,
    price_distribuidor,
    proveedor_id,
    precio_final,
    marca,
    modelo,
    procesador,
    ram_gb,
    almacenamiento_gb,
    pantalla_pulgadas,
    camara_mp,
    bateria_mah,
    tipo_producto,
  } = req.body;
  const normalizedImageUrl = normalizeOptionalImageUrl(image_url);

  if (!id) {
    return res.status(400).json({ error: 'Product ID required for update' });
  }

  try {
    await repo.updateProduct(Number(id), {
      name,
      description,
      price,
      codigo,
      image_url: normalizedImageUrl,
      category_id: Number(category_id),
      stock_quantity,
      precio_costo_pesos,
      precio_costo_dolares,
      tipo_cambio,
      margen_local,
      margen_distribuidor,
      comision_pct,
      precio_modo,
      price_local,
      price_distribuidor,
      proveedor_id,
      precio_final,
      marca,
      modelo,
      procesador,
      ram_gb,
      almacenamiento_gb,
      pantalla_pulgadas,
      camara_mp,
      bateria_mah,
      tipo_producto,
    });
    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    const code = err.status || 500;
    if (code === 400) {
      logger.error({ err: err.message, body: req.body }, 'Bad request updating product:');
      return res.status(400).json({ error: err.message });
    }
    logger.error({ err, body: req.body }, 'Error updating product:');
    res.status(500).json({ error: 'Failed to update product' });
  }
}

async function deleteProduct(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Product ID required' });
  }

  try {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    await repo.deactivateProduct(idNum);
    res.json({ message: 'Producto enviado a papelera' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting product:');
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

async function listDeletedProducts(req, res) {
  try {
    const rows = await repo.listDeletedProducts({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(rows);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching deleted products:');
    res.status(500).json({ error: 'No se pudo obtener la papelera de productos' });
  }
}

async function restoreProduct(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const restored = await repo.restoreProduct(productId);
    if (!restored) {
      return res.status(404).json({ error: 'Producto no encontrado en papelera' });
    }
    res.json({ message: 'Producto restaurado', product: restored });
  } catch (err) {
    logger.error({ err: err }, 'Error restoring product:');
    res.status(500).json({ error: 'No se pudo restaurar el producto' });
  }
}

async function getProductHistory(req, res) {
  const { id } = req.params;
  const { limit, offset } = req.query || {};

  const productId = Number(id);
  if (!productId || !Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  try {
    const rows = await repo.getProductHistory(productId, { limit, offset });
    res.json(rows);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching product history:');
    res.status(500).json({ error: 'Failed to fetch product history' });
  }
}

async function getProductSupplier(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const product = await repo.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const proveedorId =
      product.proveedor_id != null && Number.isInteger(Number(product.proveedor_id))
        ? Number(product.proveedor_id)
        : null;
    if (!proveedorId) {
      return res.json({
        producto_id: productId,
        producto_nombre: product.name,
        proveedor: null,
      });
    }
    const proveedor = await supplierRepo.findById(proveedorId, { includeSensitive: true });
    return res.json({
      producto_id: productId,
      producto_nombre: product.name,
      proveedor,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching product supplier:');
    return res.status(500).json({ error: 'No se pudo obtener el proveedor del producto' });
  }
}

const validateSetProductPriceRows = [
  body('rows').isArray(),
  body('rows.*.lista_precio_id').isInt({ gt: 0 }),
  body('rows.*.modo').optional().isIn(['auto', 'manual']),
  body('rows.*.precio').optional({ nullable: true }).isFloat({ min: 0 }),
  body('rows.*.margen_override_ratio').optional({ nullable: true }).isFloat({ min: 0 }),
];

async function getProductPriceRows(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const rows = await priceListRepo.listProductPriceRows(productId, {
      includeInactiveLists: true,
    });
    res.json(rows);
  } catch (err) {
    const code = err.status || 500;
    res.status(code).json({ error: err.message || 'No se pudieron obtener los precios del producto' });
  }
}

async function getProductCommissionPreview(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const [product, priceRows, commissionConfig] = await Promise.all([
      repo.findById(productId),
      priceListRepo.listProductPriceRows(productId, {
        includeInactiveLists: true,
      }),
      pricingRepo.getCommissionConfig(),
    ]);

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const pctByCode = commissionConfig?.porcentajes || {};
    const previewByList = (priceRows || []).map((row) => {
      const code = String(row?.list?.legacy_code || row?.list?.slug || row?.list?.key || '')
        .trim()
        .toLowerCase();
      const precioVenta = Number(row?.precio || 0);
      const comisionPct = Number(pctByCode?.[code] || 0);
      return {
        lista_codigo: code,
        lista_nombre: row?.list?.nombre || row?.list?.label || code,
        precio_venta: precioVenta,
        comision_pct: comisionPct,
        comision_monto: Math.round(precioVenta * (comisionPct / 100) * 100) / 100,
        activo: row?.list?.activo !== false,
      };
    });

    const hasOfferConfig = Object.prototype.hasOwnProperty.call(pctByCode, 'oferta');
    if (hasOfferConfig) {
      previewByList.push({
        lista_codigo: 'oferta',
        lista_nombre: 'Lista Oferta',
        precio_venta: null,
        comision_pct: Number(pctByCode.oferta || 0),
        comision_monto: null,
        activo: true,
        nota: 'El precio final depende de la oferta activa aplicada en la venta.',
      });
    }

    res.json({
      producto_id: productId,
      producto_nombre: product.name,
      modo: commissionConfig?.mode || 'lista',
      comision_tipo: commissionConfig?.comision_tipo || 'por_lista',
      producto_comision_pct: Number(product.comision_pct || 0),
      preview_por_lista: previewByList,
      nota: 'Los porcentajes pueden variar por vendedor si usan configuracion personalizada.',
    });
  } catch (err) {
    const code = err.status || 500;
    res.status(code).json({
      error: err.message || 'No se pudo obtener la vista previa de comisiones',
    });
  }
}

async function setProductPriceRows(req, res) {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub)) ? Number(req.user.sub) : null;
  try {
    const rows = await priceListRepo.updateProductPriceRows(productId, req.body?.rows || [], {
      usuarioId,
      motivo: 'set_product_price_rows',
    });
    res.json(rows);
  } catch (err) {
    const code = err.status || 500;
    res.status(code).json({ error: err.message || 'No se pudieron actualizar los precios del producto' });
  }
}

async function getProductByCodigo(req, res) {
  const codigo = String(req.params.codigo || '').trim();
  if (!codigo) {
    return res.status(400).json({ error: 'codigo requerido' });
  }
  try {
    const row = await repo.findByCodigo(codigo);
    if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(row);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching product by codigo:');
    res.status(500).json({ error: 'Failed to fetch product' });
  }
}

async function importProductsSync(req, res) {
  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: 'Archivo requerido (xlsx o csv)' });
  }

  const dryRun =
    String(req.query.dry_run || req.query.preview || '').trim() === '1';

  try {
    const worksheet = await loadWorksheet(file);
    const headerInfo = findHeaderRow(worksheet);
    const headerRow = worksheet.getRow(headerInfo.rowIndex);
    const columnMap = headerInfo.map;
    const fallbackCategory = (() => {
      const base = path.parse(file.originalname || '').name;
      const fromFile = cleanHeading(normalizeText(base.replace(/[_-]+/g, ' ')));
      if (fromFile && !isNoiseHeading(fromFile) && fromFile.length >= 2) return fromFile;
      const fromSheet = cleanHeading(normalizeText(worksheet.name || ''));
      if (fromSheet && !isNoiseHeading(fromSheet) && fromSheet.length >= 2) return fromSheet;
      return null;
    })();

    let useFallback = false;
    let fallbackItems = [];
    if (!columnMap.name || (!columnMap.category && !columnMap.category_path && !columnMap.category_id)) {
      fallbackItems = extractProductCategoryMatrixRows(worksheet, {
        rootCategory: fallbackCategory,
      });
      if (!fallbackItems.length) {
        fallbackItems = extractFallbackRows(worksheet, { fallbackCategory });
      }
      if (!fallbackItems.length) {
        return res.status(400).json({
          error: 'Falta la columna de nombre de producto',
          detalle: 'No se detectaron encabezados, una matriz valida o datos simples. Usa encabezados, una matriz Modelo x Subcategoria o un formato simple (nombre + precio).',
        });
      }
      useFallback = true;
    }

    const errors = [];
    const skipped = [];
    const preview = [];
    const seenCodes = new Set();
    const seenNameCategory = new Set();
    const existingCodeCache = new Map();
    const existingNameCatCache = new Map();
    const categoryCache = new Map();
    let created = 0;
    let wouldCreate = 0;
    let skippedCount = 0;
    let categoryCreated = 0;
    let categoryRestored = 0;
    let rowCount = 0;

    function categoryNodeCacheKey(parentId, name) {
      return `node:${parentId || 0}:${normalizeText(name).toLowerCase()}`;
    }

    async function findCategoryNode(name, parentId) {
      const key = categoryNodeCacheKey(parentId, name);
      if (categoryCache.has(key)) return categoryCache.get(key);
      const row = await categoryRepo.findByName(name, parentId);
      categoryCache.set(key, row || null);
      return row || null;
    }

    async function findCategoryByPathSegments(segments) {
      if (!Array.isArray(segments) || !segments.length) return null;
      let parentId = null;
      let found = null;
      for (const segment of segments) {
        found = await findCategoryNode(segment, parentId);
        if (!found) return null;
        parentId = found.id ? Number(found.id) : null;
      }
      return found;
    }

    async function ensureCategoryByPathSegments(segments) {
      if (!Array.isArray(segments) || !segments.length) return null;
      let parentId = null;
      let current = null;

      for (const segment of segments) {
        const existing = await findCategoryNode(segment, parentId);
        if (existing && existing.activo) {
          current = existing;
          parentId = Number(existing.id);
          continue;
        }

        const ensured = await categoryRepo.restoreOrInsert({
          name: normalizeText(segment),
          image_url: null,
          description: null,
          parent_id: parentId,
          sort_order: 0,
        });
        if (ensured?.restored) categoryRestored += 1;
        else categoryCreated += 1;

        categoryCache.delete(categoryNodeCacheKey(parentId, segment));
        const refreshed = await findCategoryNode(segment, parentId);
        if (!refreshed) return null;
        current = refreshed;
        parentId = Number(refreshed.id);
      }

      return current;
    }

    async function resolveCategoryId({ categoryName, categoryPath, categoryId }) {
      if (categoryId && Number.isInteger(categoryId) && categoryId > 0) {
        const cacheKey = `id:${categoryId}`;
        if (categoryCache.has(cacheKey)) return categoryCache.get(cacheKey);
        const existing = await categoryRepo.findById(categoryId);
        if (!existing) return null;
        categoryCache.set(cacheKey, existing);
        return existing;
      }

      const segments = Array.isArray(categoryPath) ? categoryPath.filter(Boolean) : [];
      if (segments.length) {
        return findCategoryByPathSegments(segments);
      }

      const categoryNameNorm = normalizeText(categoryName);
      if (!categoryNameNorm) return null;
      const cacheKey = `name:any:${categoryNameNorm.toLowerCase()}`;
      if (categoryCache.has(cacheKey)) return categoryCache.get(cacheKey);
      const existing = await categoryRepo.findByName(categoryNameNorm);
      categoryCache.set(cacheKey, existing || null);
      return existing || null;
    }

    async function ensureCategory({ categoryName, categoryPath }) {
      const segments = Array.isArray(categoryPath) ? categoryPath.filter(Boolean) : [];
      if (segments.length) {
        return ensureCategoryByPathSegments(segments);
      }

      const categoryNameNorm = normalizeText(categoryName);
      if (!categoryNameNorm) return null;
      const cacheKey = `name:any:${categoryNameNorm.toLowerCase()}`;
      if (categoryCache.has(cacheKey) && categoryCache.get(cacheKey)) {
        return categoryCache.get(cacheKey);
      }
      const existing = await categoryRepo.findByName(categoryNameNorm);
      if (existing) {
        categoryCache.set(cacheKey, existing);
        if (!existing.activo) {
          await categoryRepo.restoreOrInsert({
            name: categoryNameNorm,
            image_url: null,
            description: null,
            parent_id: existing.parent_id || null,
            sort_order: existing.sort_order || 0,
          });
          categoryRestored += 1;
          const refreshed = await categoryRepo.findByName(categoryNameNorm, existing.parent_id ?? null);
          categoryCache.set(cacheKey, refreshed);
          return refreshed;
        }
        return existing;
      }
      await categoryRepo.restoreOrInsert({
        name: categoryNameNorm,
        image_url: null,
        description: null,
        parent_id: null,
        sort_order: 0,
      });
      categoryCreated += 1;
      const refreshed = await categoryRepo.findByName(categoryNameNorm, null);
      categoryCache.set(cacheKey, refreshed);
      return refreshed;
    }

    async function existsByCodigo(codigo) {
      if (!codigo) return false;
      const key = codigo.toLowerCase();
      if (existingCodeCache.has(key)) return existingCodeCache.get(key);
      const found = await repo.findByCodigo(codigo);
      const exists = Boolean(found && found.id);
      existingCodeCache.set(key, exists);
      return exists;
    }

    async function existsByNameCategory(name, categoryId) {
      if (!name || !categoryId) return false;
      const key = `${name.toLowerCase()}|${categoryId}`;
      if (existingNameCatCache.has(key)) return existingNameCatCache.get(key);
      const found = await repo.findByNameCategory(name, categoryId);
      const exists = Boolean(found);
      existingNameCatCache.set(key, exists);
      return exists;
    }

    const lastRow = worksheet.rowCount || 0;
    const startRow = headerInfo.rowIndex + 1;

    if (useFallback) {
      rowCount = fallbackItems.length;
      for (const item of fallbackItems) {
        const rowIndex = item.rowIndex;
        const name = normalizeText(item.name);
        const categoryPath = Array.isArray(item.categoryPath)
          ? item.categoryPath.map((segment) => normalizeText(segment)).filter(Boolean)
          : parseCategoryPath(normalizeText(item.category || fallbackCategory || ''));
        const categoryName = categoryPath.join(' > ');
        const price = parseNumber(item.price);
        const allowZeroPrice = Boolean(item.allowZeroPrice);
        const normalizedPrice = price != null && price > 0 ? price : 0;

        if (!name) {
          errors.push({ row: rowIndex, field: 'nombre', message: 'Nombre requerido' });
          continue;
        }
        if (item.brandError) {
          errors.push({ row: rowIndex, field: 'marca', message: item.brandError });
          continue;
        }
        if (!categoryPath.length) {
          errors.push({ row: rowIndex, field: 'categoria', message: 'Categoría requerida' });
          continue;
        }
        if (!allowZeroPrice && (!price || price <= 0)) {
          errors.push({ row: rowIndex, field: 'precio', message: 'Precio requerido' });
          continue;
        }

        let categoryRecord = await resolveCategoryId({ categoryName, categoryPath });
        if (!categoryRecord && !dryRun) {
          categoryRecord = await ensureCategory({ categoryName, categoryPath });
        }
        if (!categoryRecord && dryRun) {
          categoryRecord = { id: null, name: categoryName, activo: false, pending: true };
        }

        const categoryIdFinal = categoryRecord?.id ? Number(categoryRecord.id) : null;
        if (!categoryIdFinal && !dryRun) {
          errors.push({ row: rowIndex, field: 'categoria', message: 'No se pudo resolver la categoría' });
          continue;
        }

        const nameKey = `${name.toLowerCase()}|${categoryIdFinal || categoryName.toLowerCase()}`;
        if (seenNameCategory.has(nameKey)) {
          skipped.push({ row: rowIndex, reason: 'Duplicado en archivo', name, category: categoryName });
          skippedCount += 1;
          continue;
        }
        const existsByName = categoryIdFinal
          ? await existsByNameCategory(name, categoryIdFinal)
          : false;
        if (existsByName) {
          skipped.push({ row: rowIndex, reason: 'Duplicado en sistema', name, category: categoryName });
          skippedCount += 1;
          continue;
        }
        seenNameCategory.add(nameKey);

        const payload = {
          name,
          description: item.description || undefined,
          price: normalizedPrice,
          image_url: item.image_url || undefined,
          category_id: categoryIdFinal || undefined,
          codigo: item.codigo || undefined,
          modelo: item.modelo || undefined,
          tipo_producto: item.tipo_producto || undefined,
        };

        if (dryRun) {
          wouldCreate += 1;
          preview.push({
            row: rowIndex,
            name,
            codigo: payload.codigo || null,
            categoria: categoryName,
            precio: normalizedPrice,
            costo_pesos: null,
            costo_dolares: null,
            stock: 0,
            image_url: payload.image_url || null,
          });
          continue;
        }

        try {
          await repo.createProduct(payload);
          created += 1;
        } catch (err) {
          errors.push({
            row: rowIndex,
            field: 'producto',
            message: err?.message || 'No se pudo crear el producto',
          });
        }
      }
    } else {
      for (let rowIndex = startRow; rowIndex <= lastRow; rowIndex += 1) {
        const row = worksheet.getRow(rowIndex);
        if (!row || row.actualCellCount === 0) continue;
        rowCount += 1;

        const name = normalizeText(extractCellValue(row.getCell(columnMap.name)));
        const categoryNameRaw = columnMap.category
          ? normalizeText(extractCellValue(row.getCell(columnMap.category)))
          : '';
        const categoryPathRaw = columnMap.category_path
          ? normalizeText(extractCellValue(row.getCell(columnMap.category_path)))
          : '';
        const categoryPath = parseCategoryPath(categoryPathRaw || categoryNameRaw);
        const categoryName = categoryPath.join(' > ');
        const categoryIdRaw = columnMap.category_id
          ? extractCellValue(row.getCell(columnMap.category_id))
          : null;
        const categoryId = categoryIdRaw ? Number(parseNumber(categoryIdRaw)) : null;
        const codigo = columnMap.codigo
          ? normalizeText(extractCellValue(row.getCell(columnMap.codigo)))
          : '';
        const description = columnMap.description
          ? normalizeText(extractCellValue(row.getCell(columnMap.description)))
          : '';
        const price = columnMap.price ? parseNumber(extractCellValue(row.getCell(columnMap.price))) : null;
        const precioFinal = columnMap.precio_final
          ? parseNumber(extractCellValue(row.getCell(columnMap.precio_final)))
          : null;
        const costoPesos = columnMap.costo_pesos
          ? parseNumber(extractCellValue(row.getCell(columnMap.costo_pesos)))
          : null;
        const costoDolares = columnMap.costo_dolares
          ? parseNumber(extractCellValue(row.getCell(columnMap.costo_dolares)))
          : null;
        const tipoCambio = columnMap.tipo_cambio
          ? parseNumber(extractCellValue(row.getCell(columnMap.tipo_cambio)))
          : null;
        const margenLocal = columnMap.margen_local
          ? normalizeMargin(extractCellValue(row.getCell(columnMap.margen_local)))
          : null;
        const margenDistribuidor = columnMap.margen_distribuidor
          ? normalizeMargin(extractCellValue(row.getCell(columnMap.margen_distribuidor)))
          : null;
        const stockQuantity = columnMap.stock_quantity
          ? parseNumber(extractCellValue(row.getCell(columnMap.stock_quantity)))
          : null;
        const imageUrl = columnMap.image_url
          ? normalizeText(extractCellValue(row.getCell(columnMap.image_url)))
          : '';
        const marca = columnMap.marca ? normalizeText(extractCellValue(row.getCell(columnMap.marca))) : '';
        const modelo = columnMap.modelo ? normalizeText(extractCellValue(row.getCell(columnMap.modelo))) : '';
        const procesador = columnMap.procesador ? normalizeText(extractCellValue(row.getCell(columnMap.procesador))) : '';
        const ramGb = columnMap.ram_gb ? parseNumber(extractCellValue(row.getCell(columnMap.ram_gb))) : null;
        const almacenamientoGb = columnMap.almacenamiento_gb
          ? parseNumber(extractCellValue(row.getCell(columnMap.almacenamiento_gb)))
          : null;
        const pantallaPulgadas = columnMap.pantalla_pulgadas
          ? parseNumber(extractCellValue(row.getCell(columnMap.pantalla_pulgadas)))
          : null;
        const camaraMp = columnMap.camara_mp ? parseNumber(extractCellValue(row.getCell(columnMap.camara_mp))) : null;
        const bateriaMah = columnMap.bateria_mah ? parseNumber(extractCellValue(row.getCell(columnMap.bateria_mah))) : null;

      if (!name) {
        errors.push({ row: rowIndex, field: 'nombre', message: 'Nombre requerido' });
        continue;
      }

      if (!categoryPath.length && (!categoryId || !Number.isInteger(categoryId))) {
        errors.push({ row: rowIndex, field: 'categoria', message: 'Categoría requerida' });
        continue;
      }

      const hasPriceData =
        (price && price > 0) ||
        (precioFinal && precioFinal > 0) ||
        (costoPesos && costoPesos > 0) ||
        (costoDolares && costoDolares > 0);
      if (!hasPriceData) {
        errors.push({
          row: rowIndex,
          field: 'precio',
          message: 'Debe incluir precio o costo (pesos o dólares)',
        });
        continue;
      }

      const normalizedCode = codigo ? codigo.toLowerCase() : '';
      if (normalizedCode) {
        if (seenCodes.has(normalizedCode)) {
          skipped.push({ row: rowIndex, reason: 'Duplicado en archivo', codigo, name, category: categoryName });
          skippedCount += 1;
          continue;
        }
      }

      let categoryRecord = null;
      if (categoryId && Number.isInteger(categoryId) && categoryId > 0) {
        categoryRecord = await resolveCategoryId({ categoryId });
        if (!categoryRecord) {
          errors.push({ row: rowIndex, field: 'categoria_id', message: 'Categoría no encontrada' });
          continue;
        }
      } else {
        categoryRecord = await resolveCategoryId({ categoryName, categoryPath });
        if (!categoryRecord && !dryRun) {
          categoryRecord = await ensureCategory({ categoryName, categoryPath });
        }
        if (!categoryRecord && dryRun) {
          categoryRecord = { id: null, name: categoryName, activo: false, pending: true };
        }
      }

      const categoryIdFinal = categoryRecord?.id ? Number(categoryRecord.id) : null;
      if (!categoryIdFinal && !dryRun) {
        errors.push({ row: rowIndex, field: 'categoria', message: 'No se pudo resolver la categoría' });
        continue;
      }

      const nameKey = `${name.toLowerCase()}|${categoryIdFinal || normalizeText(categoryName).toLowerCase()}`;
      if (!normalizedCode && seenNameCategory.has(nameKey)) {
        skipped.push({ row: rowIndex, reason: 'Duplicado en archivo', name, category: categoryName });
        skippedCount += 1;
        continue;
      }

      if (normalizedCode) {
        const exists = await existsByCodigo(codigo);
        if (exists) {
          skipped.push({ row: rowIndex, reason: 'Duplicado en sistema', codigo, name, category: categoryName });
          skippedCount += 1;
          continue;
        }
      } else if (categoryIdFinal) {
        const existsByName = await existsByNameCategory(name, categoryIdFinal);
        if (existsByName) {
          skipped.push({ row: rowIndex, reason: 'Duplicado en sistema', name, category: categoryName });
          skippedCount += 1;
          continue;
        }
      }

      if (normalizedCode) seenCodes.add(normalizedCode);
      if (!normalizedCode) seenNameCategory.add(nameKey);

      const payload = {
        name,
        codigo: codigo || undefined,
        description: description || undefined,
        price: price && price > 0 ? price : (precioFinal && precioFinal > 0 ? precioFinal : undefined),
        image_url: imageUrl || undefined,
        category_id: categoryIdFinal || undefined,
        stock_quantity: Number.isFinite(Number(stockQuantity)) ? Math.max(0, Number(stockQuantity)) : undefined,
        precio_costo_pesos: costoPesos && costoPesos > 0 ? costoPesos : undefined,
        precio_costo_dolares: costoDolares && costoDolares > 0 ? costoDolares : undefined,
        tipo_cambio: tipoCambio && tipoCambio > 0 ? tipoCambio : undefined,
        margen_local: margenLocal != null ? margenLocal : undefined,
        margen_distribuidor: margenDistribuidor != null ? margenDistribuidor : undefined,
        precio_final: precioFinal && precioFinal > 0 ? precioFinal : undefined,
        marca: marca || undefined,
        modelo: modelo || undefined,
        procesador: procesador || undefined,
        ram_gb: ramGb != null ? Math.max(0, Number(ramGb)) : undefined,
        almacenamiento_gb: almacenamientoGb != null ? Math.max(0, Number(almacenamientoGb)) : undefined,
        pantalla_pulgadas: pantallaPulgadas != null ? Math.max(0, Number(pantallaPulgadas)) : undefined,
        camara_mp: camaraMp != null ? Math.max(0, Number(camaraMp)) : undefined,
        bateria_mah: bateriaMah != null ? Math.max(0, Number(bateriaMah)) : undefined,
      };

        if (dryRun) {
          wouldCreate += 1;
          preview.push({
            row: rowIndex,
            name,
            codigo: codigo || null,
            categoria: categoryName || categoryRecord?.nombre || categoryRecord?.name || null,
            precio: payload.price ?? null,
            costo_pesos: payload.precio_costo_pesos ?? null,
            costo_dolares: payload.precio_costo_dolares ?? null,
            stock: payload.stock_quantity ?? 0,
            image_url: payload.image_url || null,
          });
          continue;
        }

        try {
          await repo.createProduct(payload);
          created += 1;
        } catch (err) {
          errors.push({
            row: rowIndex,
            field: 'producto',
            message: err?.message || 'No se pudo crear el producto',
          });
        }
      }
    }

    return res.json({
      dry_run: dryRun,
      totals: {
        rows: rowCount,
        created,
        would_create: wouldCreate,
        skipped: skippedCount,
        errors: errors.length,
        categories_created: categoryCreated,
        categories_restored: categoryRestored,
      },
      preview: preview.slice(0, 30),
      skipped,
      errors,
    });
  } catch (err) {
    logger.error({ err: err }, 'Error importando productos:');
    return res.status(500).json({ error: 'No se pudo importar el archivo' });
  }
}

async function importProducts(req, res) {
  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: 'Archivo requerido (xlsx o csv)' });
  }

  const dryRun =
    String(req.query?.dry_run || req.query?.preview || '').trim() === '1';
  const forceAsync = String(req.query?.async || '').trim() === '1';

  if (dryRun) {
    return importProductsSync(req, res);
  }

  let estimatedRows = 0;
  try {
    const worksheet = await loadWorksheet(file);
    estimatedRows = Math.max(0, Number(worksheet?.rowCount || 0) - 1);
  } catch (_) {
    estimatedRows = 0;
  }

  if (!forceAsync && estimatedRows <= PRODUCT_IMPORT_ASYNC_THRESHOLD) {
    return importProductsSync(req, res);
  }

  const job = importJobs.createJob({
    type: 'productos-import',
    fileName: file.originalname,
    totalRows: estimatedRows,
  });
  importJobs.startJob(job.id, {
    total_rows: estimatedRows,
    processed_rows: 0,
    created_rows: 0,
    skipped_rows: 0,
    message: 'Procesando importacion de productos',
  });

  const asyncReq = {
    ...req,
    query: {
      ...(req.query || {}),
      async: undefined,
    },
  };

  setImmediate(async () => {
    const fakeRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) {
          importJobs.failJob(job.id, {
            error: payload?.error || 'Fallo la importacion de productos',
            message: payload?.error || 'Fallo la importacion de productos',
          });
          return payload;
        }

        const totals = payload?.totals || {};
        importJobs.finishJob(job.id, {
          total_rows: Number(totals.rows || estimatedRows || 0),
          processed_rows: Number(totals.rows || estimatedRows || 0),
          created_rows: Number(totals.created || 0),
          skipped_rows: Number(totals.skipped || 0),
          errors: Array.isArray(payload?.errors) ? payload.errors : [],
          preview: Array.isArray(payload?.preview) ? payload.preview : [],
          message: `Importacion finalizada. ${Number(totals.created || 0)} productos creados`,
        });
        return payload;
      },
    };

    try {
      await importProductsSync(asyncReq, fakeRes);
    } catch (error) {
      importJobs.failJob(job.id, {
        error: error?.message || 'Fallo la importacion de productos',
        message: error?.message || 'Fallo la importacion de productos',
      });
    }
  });

  return res.status(202).json({
    async: true,
    job: importJobs.getJob(job.id),
  });
}

// ─── Pedido a Proveedor — Generación de PDF ───────────────────────────────────
async function generarPedidoProveedorPdf(req, res) {
  try {
    const { productos, filterLabel } = req.body || {};

    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un producto en el array "productos".' });
    }

    // Validación básica de cada item
    const items = productos.map((p, idx) => {
      if (!p || typeof p !== 'object') throw Object.assign(new Error(`Item ${idx + 1} inválido`), { status: 400 });
      return {
        id:                  Number(p.id)               || 0,
        name:                String(p.name              || '').trim(),
        codigo:              String(p.codigo            || '').trim() || null,
        category_name:       String(p.category_name     || '').trim() || null,
        stock_quantity:      Number(p.stock_quantity    ?? 0),
        stock_minimo:        Number(p.stock_minimo      ?? 0),
        cantidad_solicitada: p.cantidad_solicitada != null ? Number(p.cantidad_solicitada) : null,
      };
    });

    // Leer perfil del negocio desde config
    const [nombre, direccion, logoUrl] = await Promise.all([
      configRepo.getTextParam('business_name').catch(() => null),
      configRepo.getTextParam('business_address').catch(() => null),
      configRepo.getTextParam('business_logo_url').catch(() => null),
    ]);

    const empresa = {
      nombre:   nombre   || 'Mi Empresa',
      direccion: direccion || '',
      logoUrl:  logoUrl  || '',
    };

    const label = String(filterLabel || 'Stock Bajo / Sin Stock').trim();

    const pdfBuffer = await buildSupplierOrderPdf({
      empresa,
      productos: items,
      filterLabel: label,
      fecha: new Date(),
    });

    const safeNombre = empresa.nombre.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr    = new Date().toISOString().slice(0, 10);
    const filename   = `pedido_proveedor_${safeNombre}_${dateStr}.pdf`;

    res.setHeader('Content-Type',        'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length',      pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    logger.error({ err }, 'Error generando PDF de pedido a proveedor:');
    const status = err?.status || 500;
    res.status(status).json({ error: err?.message || 'No se pudo generar el PDF' });
  }
}

module.exports = {
  getProducts,
  createProduct: [...validateProduct, createProduct],
  updateProduct: [...validateProduct, updateProduct],
  deleteProduct,
  listDeletedProducts,
  restoreProduct,
  getProductHistory,
  getProductSupplier,
  getProductPriceRows,
  getProductCommissionPreview,
  setProductPriceRows: [...validateSetProductPriceRows, setProductPriceRows],
  getProductByCodigo,
  importProducts,
  generarPedidoProveedorPdf,
};
