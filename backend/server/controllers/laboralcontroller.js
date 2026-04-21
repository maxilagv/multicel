const { body, validationResult } = require('express-validator');
const { query } = require('../db/pg');
const laboralRepo = require('../db/repositories/laboralRepository');
const sectorRepo = require('../db/repositories/sectorRepository');
const salesRepo = require('../db/repositories/salesRepository');
const systemProductService = require('../services/systemProductService');
const emailService = require('../services/emailService');
const { buildCarpetaPdf } = require('../services/laboralPdfService');
const logger = require('../lib/logger');

function getUserId(req) {
  const value = req.user?.sub || req.user?.id || null;
  return value != null ? Number(value) : null;
}

function sendValidationErrors(res, errors) {
  return res.status(400).json({ errors: errors.array() });
}

async function listTiposExamen(req, res) {
  try {
    const rows = await laboralRepo.listTiposExamen();
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[laboral] listTiposExamen');
    res.status(500).json({ error: 'No se pudieron obtener los tipos de examen' });
  }
}

async function listSectores(req, res) {
  try {
    const rows = await sectorRepo.list({ incluirUsuarios: true });
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[laboral] listSectores');
    res.status(500).json({ error: 'No se pudieron obtener los sectores' });
  }
}

const validateNomenclador = [
  body('cliente_pagador_id').isInt({ gt: 0 }).withMessage('cliente_pagador_id requerido'),
  body('tipo_examen_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('codigo').trim().notEmpty().withMessage('codigo requerido'),
  body('descripcion').trim().notEmpty().withMessage('descripcion requerida'),
  body('precio_unitario').isFloat({ min: 0 }).withMessage('precio_unitario invalido'),
];

const validateNomencladorUpdate = [
  body('cliente_pagador_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('tipo_examen_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('codigo').optional().trim().notEmpty().withMessage('codigo requerido'),
  body('descripcion').optional().trim().notEmpty().withMessage('descripcion requerida'),
  body('precio_unitario').optional().isFloat({ min: 0 }).withMessage('precio_unitario invalido'),
];

async function listNomencladores(req, res) {
  try {
    const rows = await laboralRepo.listNomencladores(req.query || {});
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[laboral] listNomencladores');
    res.status(500).json({ error: 'No se pudieron obtener los nomencladores' });
  }
}

async function createNomencladorHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await laboralRepo.createNomenclador(req.body);
    res.status(201).json(row);
  } catch (error) {
    logger.error({ err: error }, '[laboral] createNomenclador');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear el nomenclador' });
  }
}

async function updateNomencladorHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await laboralRepo.updateNomenclador(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Nomenclador no encontrado' });
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, '[laboral] updateNomenclador');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar el nomenclador' });
  }
}

const validateCarpeta = [
  body('cliente_pagador_id').isInt({ gt: 0 }).withMessage('cliente_pagador_id requerido'),
  body('tipo_examen_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('tipo_carpeta').optional().isIn(['ingreso', 'periodico', 'egreso', 'art']),
  body('empleado_nombre').trim().notEmpty().withMessage('empleado_nombre requerido'),
  body('fecha_turno').optional({ nullable: true }).isISO8601(),
  body('proximo_control_fecha').optional({ nullable: true }).isISO8601(),
];

const validateCarpetaUpdate = [
  body('cliente_pagador_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('tipo_examen_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('tipo_carpeta').optional().isIn(['ingreso', 'periodico', 'egreso', 'art']),
  body('empleado_nombre').optional().trim().notEmpty().withMessage('empleado_nombre requerido'),
  body('fecha_turno').optional({ nullable: true }).isISO8601(),
  body('proximo_control_fecha').optional({ nullable: true }).isISO8601(),
];

async function listCarpetas(req, res) {
  try {
    const rows = await laboralRepo.listCarpetas(req.query || {});
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[laboral] listCarpetas');
    res.status(500).json({ error: 'No se pudieron obtener las carpetas laborales' });
  }
}

async function createCarpetaHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await laboralRepo.createCarpeta({
      ...req.body,
      created_by: getUserId(req),
    });
    res.status(201).json(row);
  } catch (error) {
    logger.error({ err: error }, '[laboral] createCarpeta');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo crear la carpeta' });
  }
}

async function detalleCarpeta(req, res) {
  try {
    const row = await laboralRepo.getCarpetaById(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Carpeta no encontrada' });
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, '[laboral] detalleCarpeta');
    res.status(500).json({ error: 'No se pudo obtener la carpeta laboral' });
  }
}

async function updateCarpetaHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await laboralRepo.updateCarpeta(Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'Carpeta no encontrada' });
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, '[laboral] updateCarpeta');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar la carpeta' });
  }
}

const validateInforme = [
  body('estado').optional().isIn(['pendiente', 'realizado', 'firmado']),
  body('profesional_id').optional({ nullable: true }).isInt({ gt: 0 }),
  body('fecha_realizacion').optional({ nullable: true }).isISO8601(),
  body('fecha_firma').optional({ nullable: true }).isISO8601(),
];

async function updateInformeHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await laboralRepo.updateInforme(
      Number(req.params.id),
      Number(req.params.informeId),
      req.body || {}
    );
    if (!row) return res.status(404).json({ error: 'Informe no encontrado' });
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, '[laboral] updateInforme');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar el informe' });
  }
}

const validateDocumento = [
  body('nombre_archivo').trim().notEmpty().withMessage('nombre_archivo requerido'),
  body('url_archivo').trim().isURL().withMessage('url_archivo invalida'),
];

async function addDocumentoHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationErrors(res, errors);

  try {
    const row = await laboralRepo.addDocumento(Number(req.params.id), {
      ...req.body,
      uploaded_by: getUserId(req),
    });
    res.status(201).json(row);
  } catch (error) {
    logger.error({ err: error }, '[laboral] addDocumento');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo agregar el documento' });
  }
}

async function getAusentismoPendiente(req, res) {
  try {
    const rows = await laboralRepo.listAusentismoPendiente({
      dias: req.query?.dias,
    });
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '[laboral] getAusentismoPendiente');
    res.status(500).json({ error: 'No se pudo obtener el seguimiento de ausentismo' });
  }
}

async function generarPdf(req, res) {
  try {
    const carpeta = await laboralRepo.getCarpetaById(Number(req.params.id));
    if (!carpeta) return res.status(404).json({ error: 'Carpeta no encontrada' });

    const buffer = await buildCarpetaPdf(carpeta);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${carpeta.numero_carpeta.toLowerCase()}-historia-clinica.pdf"`
    );
    res.send(buffer);
  } catch (error) {
    logger.error({ err: error }, '[laboral] generarPdf');
    res.status(500).json({ error: 'No se pudo generar el PDF' });
  }
}

async function enviarMail(req, res) {
  try {
    const carpeta = await laboralRepo.getCarpetaById(Number(req.params.id));
    if (!carpeta) return res.status(404).json({ error: 'Carpeta no encontrada' });

    const destinatario = req.body?.email || carpeta.empleado_email || null;
    if (!destinatario) {
      return res.status(400).json({ error: 'No hay email de destino configurado para esta carpeta' });
    }

    const result = await emailService.sendTemplateEmail({
      templateCode: 'laboral_informe',
      to: destinatario,
      toName: carpeta.empleado_nombre,
      variables: {
        numero_carpeta: carpeta.numero_carpeta,
        empleado_nombre: carpeta.empleado_nombre,
        destinatario_nombre: carpeta.empleado_nombre,
        empresa_nombre: carpeta.cliente_pagador_nombre,
      },
      entityType: 'carpeta_laboral',
      entityId: carpeta.id,
      createdBy: getUserId(req),
    });

    await query(
      `INSERT INTO carpetas_laborales_eventos(carpeta_id, tipo_evento, detalle, user_id)
       VALUES ($1, 'mail_enviado', $2, $3)`,
      [carpeta.id, `Informe enviado a ${destinatario}`, getUserId(req)]
    );

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, '[laboral] enviarMail');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo enviar el mail' });
  }
}

async function facturarLote(req, res) {
  try {
    const clientePagadorId = Number(req.body?.cliente_pagador_id);
    const periodo = String(req.body?.periodo || new Date().toISOString().slice(0, 7));
    if (!clientePagadorId) {
      return res.status(400).json({ error: 'cliente_pagador_id requerido' });
    }

    const { rows } = await query(
      `SELECT p.id,
              p.carpeta_id,
              p.cantidad,
              p.precio_unitario,
              COALESCE(n.descripcion, p.descripcion_manual, 'Servicio laboral') AS descripcion
         FROM carpetas_laborales_practicas p
         JOIN carpetas_laborales c ON c.id = p.carpeta_id
         LEFT JOIN laboral_nomencladores n ON n.id = p.nomenclador_id
        WHERE c.cliente_pagador_id = $1
          AND p.facturado = FALSE
          AND p.periodo_facturacion = $2
        ORDER BY p.id ASC`,
      [clientePagadorId, periodo]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'No hay practicas pendientes para facturar en ese periodo' });
    }

    const total = rows.reduce(
      (acc, item) => acc + Number(item.cantidad || 0) * Number(item.precio_unitario || 0),
      0
    );
    const observaciones = rows
      .map(
        (item) =>
          `${item.descripcion}: ${Number(item.cantidad || 0)} x $${Number(item.precio_unitario || 0).toFixed(2)}`
      )
      .join(' | ');

    const productId = await systemProductService.ensureServiceProduct({
      code: 'LABORAL',
      name: 'Servicio de medicina laboral',
      description: 'Producto tecnico para la facturacion masiva de practicas laborales',
    });

    const venta = await salesRepo.createVenta({
      cliente_id: clientePagadorId,
      fecha: new Date(),
      descuento: 0,
      impuestos: 0,
      allow_custom_unit_price: true,
      items: [{ producto_id: productId, cantidad: 1, precio_unitario: total }],
    });

    const practiceIds = rows.map((row) => Number(row.id));
    const placeholders = practiceIds.map((_, index) => `$${index + 1}`).join(', ');
    await query(
      `UPDATE carpetas_laborales_practicas
          SET facturado = TRUE,
              facturado_venta_id = $${practiceIds.length + 1},
              updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})`,
      [...practiceIds, venta.id]
    );
    await query('UPDATE ventas SET observaciones = $2 WHERE id = $1', [venta.id, observaciones]);

    res.json({
      venta_id: venta.id,
      practicas_facturadas: rows.length,
      total,
    });
  } catch (error) {
    logger.error({ err: error }, '[laboral] facturarLote');
    res.status(error.status || 500).json({ error: error.message || 'No se pudo facturar el lote' });
  }
}

async function enviarRecordatoriosAusentismo(req, res) {
  try {
    const rows = await laboralRepo.listAusentismoPendiente({ dias: req.body?.dias || 30 });
    let enviados = 0;

    for (const row of rows) {
      if (!row.cliente_pagador_email) continue;
      await emailService.sendTemplateEmail({
        templateCode: 'laboral_recordatorio_ausentismo',
        to: row.cliente_pagador_email,
        toName: row.cliente_pagador_nombre,
        variables: {
          empleado_nombre: row.empleado_nombre,
          destinatario_nombre: row.cliente_pagador_nombre,
          proximo_control_fecha: row.proximo_control_fecha,
          empresa_nombre: row.cliente_pagador_nombre,
        },
        entityType: 'carpeta_laboral',
        entityId: row.id,
        createdBy: getUserId(req),
      });
      enviados += 1;
    }

    res.json({
      total_detectados: rows.length,
      enviados,
    });
  } catch (error) {
    logger.error({ err: error }, '[laboral] enviarRecordatoriosAusentismo');
    res.status(error.status || 500).json({ error: error.message || 'No se pudieron enviar los recordatorios' });
  }
}

module.exports = {
  listTiposExamen,
  listSectores,
  listNomencladores,
  createNomenclador: [...validateNomenclador, createNomencladorHandler],
  updateNomenclador: [...validateNomencladorUpdate, updateNomencladorHandler],
  listCarpetas,
  createCarpeta: [...validateCarpeta, createCarpetaHandler],
  detalleCarpeta,
  updateCarpeta: [...validateCarpetaUpdate, updateCarpetaHandler],
  updateInforme: [...validateInforme, updateInformeHandler],
  addDocumento: [...validateDocumento, addDocumentoHandler],
  getAusentismoPendiente,
  generarPdf,
  enviarMail,
  facturarLote,
  enviarRecordatoriosAusentismo,
};
