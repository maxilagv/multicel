const { body, param, validationResult } = require('express-validator');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const repo = require('../db/repositories/arcaRepository');
const clientRepo = require('../db/repositories/clientRepository');
const arcaService = require('../services/arcaService');

const validateConfig = [
  body('cuit').optional().isString().isLength({ min: 8, max: 15 }),
  body('razon_social').optional().isString(),
  body('condicion_iva').optional().isString(),
  body('domicilio_fiscal').optional().isString(),
  body('provincia').optional().isString(),
  body('localidad').optional().isString(),
  body('codigo_postal').optional().isString(),
  body('ambiente').optional().isIn(['homologacion', 'produccion']),
  body('permitir_sin_entrega').optional().isBoolean(),
  body('permitir_sin_pago').optional().isBoolean(),
  body('precios_incluyen_iva').optional().isBoolean(),
  body('certificado_pem').optional().isString(),
  body('clave_privada_pem').optional().isString(),
  body('passphrase').optional().isString(),
];

const validatePuntoVenta = [
  body('punto_venta').isInt({ gt: 0 }).withMessage('punto_venta requerido'),
  body('nombre').optional().isString(),
  body('activo').optional().isBoolean(),
];

const validateAsignacionDeposito = [
  body('deposito_id').isInt({ gt: 0 }),
  body('punto_venta_id').isInt({ gt: 0 }),
];

async function getConfig(req, res) {
  try {
    const config = await repo.getConfig();
    res.json(arcaService.sanitizeConfig(config));
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo obtener config ARCA' });
  }
}

async function setConfig(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const saved = await arcaService.saveConfig(req.body || {});
    res.json(arcaService.sanitizeConfig(saved));
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo guardar config ARCA' });
  }
}

async function testConnection(req, res) {
  try {
    const result = await arcaService.testConnection();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo probar conexion ARCA' });
  }
}

async function listPuntosVenta(req, res) {
  try {
    const rows = await repo.listPuntosVenta();
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener puntos de venta' });
  }
}

async function createPuntoVenta(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const config = await repo.getConfig();
    if (!config) return res.status(400).json({ error: 'Config ARCA no creada' });
    const pv = await repo.createPuntoVenta({
      arca_config_id: config.id,
      punto_venta: Number(req.body.punto_venta),
      nombre: req.body.nombre,
      activo: req.body.activo !== undefined ? Boolean(req.body.activo) : true,
    });
    res.status(201).json(pv);
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo crear punto de venta' });
  }
}

async function updatePuntoVenta(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const id = Number(req.params.id);
    const pv = await repo.updatePuntoVenta(id, req.body || {});
    if (!pv) return res.status(404).json({ error: 'Punto de venta no encontrado' });
    res.json(pv);
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo actualizar punto de venta' });
  }
}

async function deletePuntoVenta(req, res) {
  try {
    const id = Number(req.params.id);
    const pv = await repo.deletePuntoVenta(id);
    if (!pv) return res.status(404).json({ error: 'Punto de venta no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo eliminar punto de venta' });
  }
}

async function asignarDeposito(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { deposito_id, punto_venta_id } = req.body;
    const row = await repo.assignDepositoToPuntoVenta(Number(deposito_id), Number(punto_venta_id));
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo asignar deposito' });
  }
}

async function listDepositos(req, res) {
  try {
    const rows = await repo.listDepositosConPuntoVenta();
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener depositos' });
  }
}

async function padronCliente(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  const cuit = req.body?.cuit || req.query?.cuit;
  if (!cuit) return res.status(400).json({ error: 'CUIT requerido' });
  try {
    const data = await arcaService.getPadronPersona(cuit);
    const overwrite = Boolean(req.body?.overwrite);
    const updates = {
      condicion_iva: data.condicion_iva || null,
      domicilio_fiscal: data.domicilio_fiscal || null,
      provincia: data.provincia || null,
      localidad: data.localidad || null,
      codigo_postal: data.codigo_postal || null,
      cuit_cuil: data.cuit || cuit,
      tipo_doc: 'CUIT',
      nro_doc: data.cuit || cuit,
    };
    if (overwrite) {
      updates.nombre = data.razon_social || data.nombre || null;
      updates.apellido = data.apellido || null;
    }
    await clientRepo.update(id, updates);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo consultar padron' });
  }
}

const validateEmitir = [
  body('venta_id').isInt({ gt: 0 }),
  body('punto_venta_id').optional().isInt({ gt: 0 }),
  body('tipo_comprobante').optional().isIn(['A', 'B', 'C']),
  body('concepto').optional().isInt({ min: 1, max: 3 }),
  body('fecha_serv_desde').optional().isISO8601().toDate(),
  body('fecha_serv_hasta').optional().isISO8601().toDate(),
  body('fecha_vto_pago').optional().isISO8601().toDate(),
];

async function emitirFactura(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { venta_id, punto_venta_id, tipo_comprobante, concepto, fecha_serv_desde, fecha_serv_hasta, fecha_vto_pago } = req.body;
    const role = req.authUser?.rol || req.user?.role;
    if (tipo_comprobante && !['admin', 'gerente'].includes(role)) {
      return res.status(403).json({ error: 'No autorizado para override de comprobante' });
    }
    const result = await arcaService.emitirFacturaDesdeVenta({
      ventaId: Number(venta_id),
      puntoVentaId: punto_venta_id ? Number(punto_venta_id) : null,
      tipoOverride: tipo_comprobante || null,
      usuarioId: req.authUser?.id || req.user?.sub || null,
      concepto,
      fecha_serv_desde,
      fecha_serv_hasta,
      fecha_vto_pago,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo emitir factura' });
  }
}

function parseJsonSafe(value) {
  if (!value) return null;
  try {
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function getFactura(req, res) {
  const ventaId = Number(req.params.ventaId || req.params.id);
  if (!Number.isInteger(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const factura = await repo.getFacturaByVentaId(ventaId);
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
    const snapshot = parseJsonSafe(factura.snapshot_json);
    const response = parseJsonSafe(factura.response_json);
    res.json({ factura, snapshot, response });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo obtener factura' });
  }
}

async function facturaPdf(req, res) {
  const ventaId = Number(req.params.ventaId || req.params.id);
  if (!Number.isInteger(ventaId) || ventaId <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const factura = await repo.getFacturaByVentaId(ventaId);
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
    if (factura.estado !== 'emitida') {
      return res.status(400).json({ error: 'La factura no esta emitida' });
    }

    let snapshot = parseJsonSafe(factura.snapshot_json);
    if (!snapshot) {
      snapshot = await arcaService.buildSnapshotFromVenta({ ventaId, factura });
    }

    const fileName = `factura-${factura.numero_factura || ventaId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);

    const emisor = snapshot?.emisor || {};
    const receptor = snapshot?.receptor || {};
    const comprobante = snapshot?.comprobante || {};
    const totales = snapshot?.totales || {};
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];

    const fmtMoney = (v) => `$ ${Number(v || 0).toFixed(2)}`;
    const letter = String(comprobante.tipo || factura.tipo_comprobante || 'B').toUpperCase();
    const numero = comprobante.numero || factura.numero_factura || '';
    const fecha = comprobante.fecha || factura.fecha_emision || new Date();
    const fechaObj = new Date(fecha);
    const fechaFmt = Number.isNaN(fechaObj.getTime()) ? '' : fechaObj.toISOString().slice(0, 10);

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(emisor.razon_social || 'Factura', 40, 40);
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    doc.text(`CUIT: ${emisor.cuit || '-'}`, 40, 62);
    if (emisor.domicilio_fiscal) doc.text(`Domicilio: ${emisor.domicilio_fiscal}`, 40, 74);
    if (emisor.localidad || emisor.provincia) {
      doc.text(`Localidad: ${[emisor.localidad, emisor.provincia].filter(Boolean).join(' - ')}`, 40, 86);
    }
    doc.text(`Condicion IVA: ${emisor.condicion_iva || '-'}`, 40, 98);

    const boxWidth = 200;
    const boxHeight = 70;
    const boxX = doc.page.width - doc.page.margins.right - boxWidth;
    const boxY = 40;
    doc.rect(boxX, boxY, boxWidth, boxHeight).strokeColor('#0f172a').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#0f172a').text(letter, boxX + 12, boxY + 10);
    doc.font('Helvetica').fontSize(10).fillColor('#475569').text(`Factura ${letter}`, boxX + 50, boxY + 16);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(numero, boxX + 50, boxY + 32);
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text(`Fecha: ${fechaFmt}`, boxX + 50, boxY + 50);

    doc.moveDown(4);

    // Receptor
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Receptor', 40, 130);
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${receptor.nombre || ''} ${receptor.apellido || ''}`.trim() || '-', 40, 145);
    doc.text(`Doc: ${receptor.doc_nro || '-'}`, 40, 158);
    doc.text(`Condicion IVA: ${receptor.condicion_iva || '-'}`, 40, 171);
    if (receptor.domicilio_fiscal) doc.text(`Domicilio: ${receptor.domicilio_fiscal}`, 40, 184);

    // Items table
    let y = 220;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
    doc.text('Cant', 40, y);
    doc.text('Descripcion', 90, y);
    doc.text('P.Unit', 360, y, { width: 80, align: 'right' });
    doc.text('Subtotal', 450, y, { width: 80, align: 'right' });
    doc.moveTo(40, y + 14).lineTo(doc.page.width - doc.page.margins.right, y + 14).strokeColor('#cbd5e1').stroke();
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
    for (const it of items) {
      if (y > doc.page.height - doc.page.margins.bottom - 140) {
        doc.addPage();
        y = 40;
      }
      doc.text(String(it.cantidad || 0), 40, y);
      doc.text(String(it.descripcion || ''), 90, y, { width: 250 });
      doc.text(fmtMoney(it.precio_unitario), 360, y, { width: 80, align: 'right' });
      doc.text(fmtMoney(it.subtotal), 450, y, { width: 80, align: 'right' });
      y += 14;
    }

    // Totals
    const totalsY = Math.max(y + 12, 420);
    const totalsX = doc.page.width - doc.page.margins.right - 220;
    doc.rect(totalsX, totalsY, 220, 90).strokeColor('#0f172a').lineWidth(1).stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
    doc.text('Neto', totalsX + 10, totalsY + 8);
    doc.text(fmtMoney(totales.imp_neto), totalsX + 10, totalsY + 8, { width: 200, align: 'right' });
    doc.text('IVA', totalsX + 10, totalsY + 24);
    doc.text(fmtMoney(totales.imp_iva), totalsX + 10, totalsY + 24, { width: 200, align: 'right' });
    doc.text('Exento', totalsX + 10, totalsY + 40);
    doc.text(fmtMoney(totales.imp_op_ex), totalsX + 10, totalsY + 40, { width: 200, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Total', totalsX + 10, totalsY + 60);
    doc.text(fmtMoney(totales.imp_total || factura.total), totalsX + 10, totalsY + 60, { width: 200, align: 'right' });

    // CAE + QR
    const caeText = factura.cae ? `CAE: ${factura.cae} Vto: ${factura.cae_vto || '-'}` : 'CAE: -';
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(caeText, 40, totalsY + 100);

    const qrUrl = snapshot?.qr?.url || factura.qr_data;
    if (qrUrl) {
      try {
        const dataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, scale: 4 });
        const base64 = dataUrl.split(',')[1];
        const qrBuffer = Buffer.from(base64, 'base64');
        doc.image(qrBuffer, doc.page.width - doc.page.margins.right - 90, totalsY + 90, { width: 80, height: 80 });
      } catch {}
    }

    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message || 'No se pudo generar el PDF' });
  }
}

module.exports = {
  getConfig,
  setConfig: [...validateConfig, setConfig],
  testConnection,
  listPuntosVenta,
  createPuntoVenta: [...validatePuntoVenta, createPuntoVenta],
  updatePuntoVenta: [...validatePuntoVenta, updatePuntoVenta],
  deletePuntoVenta,
  asignarDeposito: [...validateAsignacionDeposito, asignarDeposito],
  listDepositos,
  padronCliente,
  getFactura,
  facturaPdf,
  emitirFactura: [...validateEmitir, emitirFactura],
};



