const { body, validationResult } = require('express-validator');
const repo = require('../db/repositories/purchaseRepository');
const audit = require('../services/auditService');
const supplierRepo = require('../db/repositories/supplierRepository');
const productRepo = require('../db/repositories/productRepository');
const plantillaSvc = require('../services/plantillaCompraService');
const importJobs = require('../services/importJobService');
const {
  buildHeaderLookup,
  extractCellValue,
  findHeaderRow,
  loadWorksheet,
  normalizeText,
  parseNumber,
} = require('../utils/spreadsheetImport');

const PURCHASE_IMPORT_ALIASES = {
  compra_ref: ['compra_ref', 'referencia', 'lote', 'grupo_compra'],
  proveedor_id: ['proveedor_id'],
  proveedor: ['proveedor', 'proveedor_nombre'],
  fecha: ['fecha', 'fecha_compra'],
  moneda: ['moneda'],
  oc_numero: ['oc_numero', 'oc', 'orden_compra'],
  adjunto_url: ['adjunto_url', 'adjunto'],
  producto_id: ['producto_id'],
  producto_codigo: ['producto_codigo', 'codigo', 'sku'],
  cantidad: ['cantidad', 'qty'],
  costo_unitario: ['costo_unitario', 'costo', 'precio_costo'],
  costo_envio: ['costo_envio', 'envio'],
  tipo_cambio: ['tipo_cambio', 'cotizacion', 'fx'],
};

const PURCHASE_IMPORT_LOOKUP = buildHeaderLookup(PURCHASE_IMPORT_ALIASES);
const PURCHASE_IMPORT_ASYNC_THRESHOLD = 150;

function normalizeImportDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function resolveImportProveedor({ proveedorId, proveedorNombre }) {
  if (proveedorId) {
    const row = await supplierRepo.findById(proveedorId);
    return row ? Number(row.id) : null;
  }
  if (proveedorNombre) {
    const row = await supplierRepo.findByExactName(proveedorNombre);
    return row ? Number(row.id) : null;
  }
  return null;
}

async function resolveImportProducto({ productoId, productoCodigo }) {
  if (productoId) {
    const row = await productRepo.findById(productoId);
    return row ? Number(row.id) : null;
  }
  if (productoCodigo) {
    const row = await productRepo.findByCodigo(productoCodigo);
    return row ? Number(row.id) : null;
  }
  return null;
}

async function parsePurchaseImportFile(file) {
  const worksheet = await loadWorksheet(file);
  const headerInfo = findHeaderRow(worksheet, PURCHASE_IMPORT_LOOKUP, [
    'proveedor_id',
    'proveedor',
    'producto_id',
    'producto_codigo',
    'cantidad',
    'costo_unitario',
  ]);
  const columnMap = headerInfo.map || {};
  if ((!columnMap.proveedor_id && !columnMap.proveedor) || (!columnMap.producto_id && !columnMap.producto_codigo)) {
    throw new Error('El archivo de compras debe incluir proveedor_id/proveedor y producto_id/producto_codigo');
  }

  const rows = [];
  const errors = [];
  const preview = [];

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex <= (worksheet.rowCount || 0); rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    if (!row || row.actualCellCount === 0) continue;

    const proveedorId = parseInt(extractCellValue(row.getCell(columnMap.proveedor_id)) || '0', 10) || null;
    const proveedor = normalizeText(extractCellValue(row.getCell(columnMap.proveedor)));
    const productoId = parseInt(extractCellValue(row.getCell(columnMap.producto_id)) || '0', 10) || null;
    const productoCodigo = normalizeText(extractCellValue(row.getCell(columnMap.producto_codigo)));
    const fecha = normalizeImportDate(extractCellValue(row.getCell(columnMap.fecha)));
    const moneda = normalizeText(extractCellValue(row.getCell(columnMap.moneda))).toUpperCase() || 'ARS';
    const ocNumero = normalizeText(extractCellValue(row.getCell(columnMap.oc_numero)));
    const compraRef = normalizeText(extractCellValue(row.getCell(columnMap.compra_ref)));
    const adjuntoUrl = normalizeText(extractCellValue(row.getCell(columnMap.adjunto_url)));
    const cantidad = parseInt(String(parseNumber(extractCellValue(row.getCell(columnMap.cantidad))) || 0), 10);
    const costoUnitario = Number(parseNumber(extractCellValue(row.getCell(columnMap.costo_unitario))) || 0);
    const costoEnvio = Number(parseNumber(extractCellValue(row.getCell(columnMap.costo_envio))) || 0);
    const tipoCambio = Number(parseNumber(extractCellValue(row.getCell(columnMap.tipo_cambio))) || 0);

    if ((!proveedorId && !proveedor) || (!productoId && !productoCodigo)) {
      errors.push({
        row: rowIndex,
        field: 'referencias',
        message: 'Cada fila debe indicar proveedor y producto',
      });
      continue;
    }
    if (!fecha) {
      errors.push({ row: rowIndex, field: 'fecha', message: 'Fecha invalida' });
      continue;
    }
    if (!['ARS', 'USD', 'CNY'].includes(moneda)) {
      errors.push({ row: rowIndex, field: 'moneda', message: 'Moneda invalida. Usa ARS, USD o CNY' });
      continue;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      errors.push({ row: rowIndex, field: 'cantidad', message: 'Cantidad requerida' });
      continue;
    }
    if (!(costoUnitario > 0)) {
      errors.push({ row: rowIndex, field: 'costo_unitario', message: 'Costo unitario requerido' });
      continue;
    }
    if (moneda !== 'ARS' && !(tipoCambio > 0)) {
      errors.push({ row: rowIndex, field: 'tipo_cambio', message: 'Tipo de cambio requerido para moneda extranjera' });
      continue;
    }

    const groupKey = compraRef || ocNumero || `${proveedorId || proveedor}|${fecha.slice(0, 10)}|${moneda}`;
    const parsedRow = {
      rowIndex,
      groupKey,
      proveedorId,
      proveedor,
      productoId,
      productoCodigo,
      fecha,
      moneda,
      ocNumero,
      adjuntoUrl,
      cantidad,
      costoUnitario,
      costoEnvio,
      tipoCambio: tipoCambio > 0 ? tipoCambio : null,
    };
    rows.push(parsedRow);
    if (preview.length < 5) {
      preview.push({
        row: rowIndex,
        compra_ref: groupKey,
        proveedor: proveedor || proveedorId,
        producto: productoCodigo || productoId,
        cantidad,
        costo_unitario: costoUnitario,
        moneda,
      });
    }
  }

  return {
    rows,
    errors,
    preview,
    totalRows: rows.length + errors.length,
  };
}

async function processPurchaseImportRows(rows, { jobId, usuarioId, seedErrors = [] } = {}) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.groupKey)) {
      groups.set(row.groupKey, []);
    }
    groups.get(row.groupKey).push(row);
  }

  const entries = Array.from(groups.entries());
  const result = {
    total: entries.length,
    created: 0,
    skipped: 0,
    errors: [],
  };

  if (jobId) {
    importJobs.startJob(jobId, {
      total_rows: entries.length,
      processed_rows: 0,
      created_rows: 0,
      skipped_rows: 0,
      message: 'Procesando importacion de compras',
    });
  }

  for (const [groupKey, groupRows] of entries) {
    try {
      const first = groupRows[0];
      const proveedorId = await resolveImportProveedor({
        proveedorId: first.proveedorId,
        proveedorNombre: first.proveedor,
      });
      if (!proveedorId) {
        throw new Error(`Proveedor no encontrado para grupo ${groupKey}`);
      }

      const detalle = [];
      for (const row of groupRows) {
        const productoId = await resolveImportProducto({
          productoId: row.productoId,
          productoCodigo: row.productoCodigo,
        });
        if (!productoId) {
          throw new Error(`Producto no encontrado en fila ${row.rowIndex}`);
        }
        detalle.push({
          producto_id: productoId,
          cantidad: row.cantidad,
          costo_unitario: row.costoUnitario,
          costo_envio: row.costoEnvio || 0,
          moneda: row.moneda,
          tipo_cambio: row.tipoCambio || undefined,
        });
      }

      const created = await repo.createCompra({
        proveedor_id: proveedorId,
        fecha: first.fecha,
        moneda: first.moneda,
        detalle,
        oc_numero: first.ocNumero || undefined,
        adjunto_url: first.adjuntoUrl || undefined,
      });

      await audit.log({
        usuario_id: usuarioId || null,
        accion: 'compra_importada_excel',
        tabla_afectada: 'compras',
        registro_id: created.id,
        descripcion: `Compra importada por lote ${groupKey}`,
      });

      result.created += 1;
    } catch (error) {
      result.errors.push({
        row: groupRows[0]?.rowIndex || null,
        field: 'compra',
        message: error?.message || `No se pudo importar la compra ${groupKey}`,
      });
    }

    if (jobId) {
      importJobs.updateJob(jobId, {
        processed_rows: result.created + result.errors.length,
        created_rows: result.created,
        skipped_rows: result.skipped,
      });
    }
  }

  if (jobId) {
    importJobs.finishJob(jobId, {
      processed_rows: entries.length,
      created_rows: result.created,
      skipped_rows: result.skipped,
      errors: [...seedErrors, ...result.errors],
      message: `Importacion finalizada. ${result.created} compras creadas`,
    });
  }

  return result;
}

const validateCreate = [
  body('proveedor_id').isInt({ gt: 0 }).withMessage('proveedor_id requerido'),
  body('moneda').optional().isIn(['ARS','USD','CNY']).withMessage('moneda inválida'),
  body('detalle').isArray({ min: 1 }).withMessage('detalle requerido'),
  body('detalle.*.producto_id').isInt({ gt: 0 }),
  body('detalle.*.cantidad').isInt({ gt: 0 }),
  body('detalle.*.costo_unitario').isFloat({ gt: 0 }),
  body('detalle.*.costo_envio').optional().isFloat({ min: 0 }),
  body('detalle.*.moneda').optional().isIn(['ARS','USD','CNY']).withMessage('moneda de detalle inválida'),
  body('detalle.*.tipo_cambio').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('tipo_cambio debe ser > 0'),
  body('oc_numero').optional().isString().isLength({ max: 100 }),
  body('adjunto_url').optional().isString().isLength({ max: 500 }),
];

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { proveedor_id, fecha, moneda, detalle, oc_numero, adjunto_url } = req.body;
    const seen = new Set();
    for (const item of detalle || []) {
      const pid = Number(item?.producto_id);
      if (!pid) continue;
      if (seen.has(pid)) {
        return res.status(400).json({ error: 'Producto duplicado en la compra' });
      }
      seen.add(pid);
    }
    const r = await repo.createCompra({ proveedor_id, fecha, moneda, detalle, oc_numero, adjunto_url });
    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    await audit.log({
      usuario_id: usuarioId,
      accion: 'compra_creada',
      tabla_afectada: 'compras',
      registro_id: r.id,
      descripcion: `Compra creada para proveedor ${proveedor_id}`,
    });
    res.status(201).json(r);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo crear la compra' });
  }
}

async function list(req, res) {
  try {
    const { limit, offset } = req.query || {};
    const rows = await repo.listarCompras({ limit, offset });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las compras' });
  }
}

async function importExcel(req, res) {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'Archivo requerido (.xlsx o .csv)' });
  }

  const dryRun = String(req.query?.dry_run || req.query?.preview || '').trim() === '1';
  const forceAsync = String(req.query?.async || '').trim() === '1';

  try {
    const parsed = await parsePurchaseImportFile(req.file);

    if (dryRun) {
      return res.json({
        dryRun: true,
        total: parsed.totalRows,
        validRows: parsed.rows.length,
        errorCount: parsed.errors.length,
        preview: parsed.preview,
        errors: parsed.errors,
      });
    }

    if (forceAsync || parsed.rows.length > PURCHASE_IMPORT_ASYNC_THRESHOLD) {
      const job = importJobs.createJob({
        type: 'compras-import',
        fileName: req.file.originalname,
        totalRows: new Set(parsed.rows.map((row) => row.groupKey)).size,
      });
      importJobs.updateJob(job.id, {
        preview: parsed.preview,
        errors: parsed.errors,
      });

      setImmediate(async () => {
        try {
          await processPurchaseImportRows(parsed.rows, {
            jobId: job.id,
            usuarioId: req.user?.sub ? Number(req.user.sub) : null,
            seedErrors: parsed.errors,
          });
        } catch (error) {
          importJobs.failJob(job.id, {
            message: error?.message || 'Fallo la importacion de compras',
          });
        }
      });

      return res.status(202).json({
        async: true,
        job: importJobs.getJob(job.id),
      });
    }

    const result = await processPurchaseImportRows(parsed.rows, {
      usuarioId: req.user?.sub ? Number(req.user.sub) : null,
    });

    return res.json({
      async: false,
      total: parsed.totalRows,
      created: result.created,
      skipped: result.skipped,
      preview: parsed.preview,
      errors: [...parsed.errors, ...result.errors],
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'No se pudo importar el archivo de compras' });
  }
}

async function detalle(req, res) {
  try {
    const rows = await repo.getCompraDetalle(Number(req.params.id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el detalle' });
  }
}

const validateRecepcion = [
  body('fecha_recepcion').optional().isISO8601(),
  body('observaciones').optional().isString(),
  body('detalle').optional().isArray({ min: 1 }),
  body('detalle.*.producto_id').optional().isInt({ gt: 0 }),
  body('detalle.*.cantidad').optional().isInt({ gt: 0 }),
];

async function recibir(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const compra_id = Number(req.params.id);
    const usuario_id = req.user?.sub ? Number(req.user.sub) : null;
    const r = await repo.recibirCompra({
      compra_id,
      fecha_recepcion: req.body.fecha_recepcion,
      observaciones: req.body.observaciones,
      usuario_id,
      deposito_id: req.body.deposito_id,
      detalle: req.body.detalle,
    });
    await audit.log({
      usuario_id: usuario_id || null,
      accion: r.received ? 'compra_recepcion_total' : 'compra_recepcion_parcial',
      tabla_afectada: 'compras',
      registro_id: compra_id,
      descripcion: r.received ? 'Recepcion completa' : 'Recepcion parcial',
    });
    res.json(r);
  } catch (e) {
    const code = e.status || 500;
    res.status(code).json({ error: e.message || 'No se pudo registrar la recepción' });
  }
}

async function descargarPlantillaFundas(req, res) {
  try {
    const buf = await plantillaSvc.generarPlantilla();
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="plantilla-pedido-fundas-${fecha}.xlsx"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo generar la plantilla' });
  }
}

async function importarPlantillaFundas(req, res) {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'Archivo requerido (.xlsx)' });
  }
  try {
    const parsed = await plantillaSvc.parsearPlantilla(req.file.buffer);

    // Resolve supplier by name
    const proveedor = await supplierRepo.findByExactName(parsed.proveedor);
    if (!proveedor) {
      return res.status(422).json({
        error: `Proveedor "${parsed.proveedor}" no encontrado. Verificá el nombre exacto en la sección Proveedores.`,
      });
    }

    // Resolve product SKUs to IDs and build detalle
    const detalle = [];
    const errores = [];
    for (const item of parsed.items) {
      const prod = await productRepo.findByCodigo(item.sku);
      if (!prod) {
        errores.push(`SKU "${item.sku}" no encontrado.`);
        continue;
      }
      detalle.push({
        producto_id: prod.id,
        cantidad: item.cantidad,
        costo_unitario: parsed.costo_unitario ?? (parsed.moneda === 'USD' ? Number(prod.precio_costo_dolares) : Number(prod.precio_costo_pesos)) ?? 0,
        costo_envio: 0,
        moneda: parsed.moneda,
        tipo_cambio: parsed.tipo_cambio ?? undefined,
      });
    }

    if (detalle.length === 0) {
      return res.status(422).json({
        error: 'Ningún producto pudo resolverse. ' + errores.join(' '),
        errores,
      });
    }

    const compra = await repo.createCompra({
      proveedor_id: proveedor.id,
      fecha: parsed.fecha,
      moneda: parsed.moneda,
      detalle,
    });

    const usuarioId = req.user?.sub ? Number(req.user.sub) : null;
    await audit.log({
      usuario_id: usuarioId,
      accion: 'compra_importada_plantilla',
      tabla_afectada: 'compras',
      registro_id: compra.id,
      descripcion: `Compra importada desde plantilla Excel — ${detalle.length} productos`,
    });

    res.status(201).json({
      compra,
      importados: detalle.length,
      errores,
    });
  } catch (e) {
    res.status(e.status || 422).json({ error: e.message || 'Error procesando la plantilla' });
  }
}

module.exports = {
  create: [...validateCreate, create],
  list,
  importExcel,
  detalle,
  recibir: [...validateRecepcion, recibir],
  descargarPlantillaFundas,
  importarPlantillaFundas,
};
