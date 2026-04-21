const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const { body, param, query: queryParam, validationResult } = require('express-validator');
const supplierRepo = require('../db/repositories/supplierRepository');
const companyAccountRepo = require('../db/repositories/companyAccountRepository');
const {
  saveReceiptFile,
  resolveReceiptFilePath,
  deleteReceiptFile,
} = require('../services/companyReceiptStorageService');

const validateList = [
  queryParam('proveedor_id').optional().isInt({ gt: 0 }),
  queryParam('limit').optional().isInt({ gt: 0, lt: 201 }),
  queryParam('offset').optional().isInt({ min: 0 }),
];

const validateReceiptUpload = [
  body('proveedor_id').isInt({ gt: 0 }).withMessage('Proveedor requerido'),
  body('monto').isFloat({ gt: 0 }).withMessage('Monto invalido'),
  body('moneda').optional().isString().isLength({ min: 1, max: 8 }),
  body('nota').optional().isString().isLength({ max: 1000 }),
];

const validateReview = [
  param('id').isInt({ gt: 0 }),
  body('nota').optional().isString().isLength({ max: 1000 }),
];

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

function sanitizeTransactionResponse(row) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row };
  delete next.comprobante_storage_url;
  return next;
}

async function listTransactions(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const role = req.authUser?.rol || req.user?.role || null;
    const filters = { ...(req.query || {}) };
    if (!['admin', 'gerente'].includes(role)) {
      filters.creado_por_usuario_id = req.authUser?.id || req.user?.sub || null;
    }
    const rows = await companyAccountRepo.listCuentaEmpresaTransactions(filters);
    res.json(rows.map((row) => sanitizeTransactionResponse(row)));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudieron obtener las transacciones' });
  }
}

async function uploadReceipt(req, res) {
  if (!handleValidation(req, res)) return;
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ error: 'Adjunta un comprobante en PDF o imagen' });
  }
  try {
    const proveedorId = Number(req.body.proveedor_id);
    const proveedor = await supplierRepo.findById(proveedorId, { includeSensitive: true });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (!proveedor.activo) {
      return res.status(400).json({ error: 'El proveedor no esta activo para cuenta empresa' });
    }
    if (!proveedor.alias_cuenta) {
      return res.status(400).json({ error: 'El proveedor todavia no tiene alias de cuenta configurado' });
    }
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const duplicate = await companyAccountRepo.findTransactionByHash(fileHash);
    if (duplicate) {
      return res.status(409).json({
        error: 'Este comprobante ya fue cargado anteriormente',
        duplicate,
      });
    }

    let storage = null;
    try {
      storage = await saveReceiptFile(req.file, {
        proveedorId,
        aliasCuenta: proveedor.alias_cuenta,
      });
      const created = await companyAccountRepo.createCuentaEmpresaTransaction({
        proveedor_id: proveedorId,
        monto: Number(req.body.monto),
        moneda: req.body.moneda || 'ARS',
        estado: 'pendiente',
        origen: 'comprobante',
        alias_cuenta_snapshot: proveedor.alias_cuenta,
        banco_snapshot: proveedor.banco || null,
        comprobante_url: storage.url,
        comprobante_nombre: path.basename(storage.filename),
        comprobante_hash: fileHash,
        nota: req.body.nota || null,
        metadata_json: JSON.stringify({
          size_bytes: storage.sizeBytes,
          mime_type: storage.mimeType,
          upload_checksum: fileHash,
        }),
        creado_por_usuario_id: req.authUser?.id || req.user?.sub || null,
      });
      res.status(201).json(sanitizeTransactionResponse(created));
    } catch (e) {
      await deleteReceiptFile(storage?.absolutePath || null);
      throw e;
    }
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo cargar el comprobante' });
  }
}

async function downloadReceipt(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const transaction = await companyAccountRepo.getCuentaEmpresaTransactionById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaccion no encontrada' });
    }
    const role = req.authUser?.rol || req.user?.role || null;
    const currentUserId = req.authUser?.id || req.user?.sub || null;
    if (
      !['admin', 'gerente'].includes(role) &&
      Number(transaction.creado_por_usuario_id) !== Number(currentUserId)
    ) {
      return res.status(403).json({ error: 'No autorizado para ver este comprobante' });
    }
    const filePath = await resolveReceiptFilePath(
      transaction.comprobante_storage_url || transaction.comprobante_url
    );
    if (!filePath) {
      return res.status(404).json({ error: 'El comprobante no esta disponible' });
    }
    const stat = await fs.stat(filePath);
    const ext = path.extname(transaction.comprobante_nombre || filePath).toLowerCase();
    const contentType =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${path.basename(transaction.comprobante_nombre || path.basename(filePath))}"`
    );
    res.setHeader('Content-Length', stat.size);
    return res.sendFile(filePath);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'No se pudo abrir el comprobante' });
  }
}

async function confirmar(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const updated = await companyAccountRepo.reviewTransaction(req.params.id, {
      estado: 'confirmado',
      nota: req.body?.nota || null,
      revisado_por_usuario_id: req.authUser?.id || req.user?.sub || null,
      acreditar: false,
    });
    res.json(sanitizeTransactionResponse(updated));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo confirmar la transaccion' });
  }
}

async function rechazar(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const updated = await companyAccountRepo.reviewTransaction(req.params.id, {
      estado: 'rechazado',
      nota: req.body?.nota || null,
      revisado_por_usuario_id: req.authUser?.id || req.user?.sub || null,
      acreditar: false,
    });
    res.json(sanitizeTransactionResponse(updated));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo rechazar la transaccion' });
  }
}

async function acreditar(req, res) {
  if (!handleValidation(req, res)) return;
  try {
    const updated = await companyAccountRepo.reviewTransaction(req.params.id, {
      estado: 'acreditado',
      nota: req.body?.nota || null,
      revisado_por_usuario_id: req.authUser?.id || req.user?.sub || null,
      acreditar: true,
    });
    res.json(sanitizeTransactionResponse(updated));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudo acreditar la transaccion' });
  }
}

module.exports = {
  listTransactions: [...validateList, listTransactions],
  uploadReceipt: [...validateReceiptUpload, uploadReceipt],
  downloadReceipt: [...validateReview, downloadReceipt],
  confirmar: [...validateReview, confirmar],
  rechazar: [...validateReview, rechazar],
  acreditar: [...validateReview, acreditar],
};
