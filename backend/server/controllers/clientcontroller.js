const { check, validationResult } = require('express-validator');
const repo = require('../db/repositories/clientRepository');
const debtRepo = require('../db/repositories/clientDebtRepository');
const paymentRepo = require('../db/repositories/paymentRepository');
const userRepo = require('../db/repositories/userRepository');
const importJobs = require('../services/importJobService');
const clientSegmentationService = require('../services/clientSegmentationService');
const { normalizePhoneToE164, deriveWhatsappStatus } = require('../utils/whatsappPhone');
const {
  resolveScopedDepositoId,
  buildDepositoVisibility,
  getRequestRole,
  getRequestUserId,
  isGlobalRole,
} = require('../lib/depositoScope');
const { buildClientVisibility, isOwnerScopedRole } = require('../lib/clientVisibility');
const {
  buildHeaderLookup,
  extractCellValue,
  findHeaderRow,
  loadWorksheet,
  normalizeText,
} = require('../utils/spreadsheetImport');

const WHATSAPP_STATUSES = [
  'unknown',
  'pending_validation',
  'valid',
  'invalid_format',
  'invalid_number',
  'blocked',
];

const CLIENT_IMPORT_ALIASES = {
  nombre: ['nombre', 'name', 'cliente', 'first_name'],
  apellido: ['apellido', 'lastname', 'last_name'],
  email: ['email', 'correo', 'mail'],
  telefono: ['telefono', 'celular', 'telefono_whatsapp', 'movil', 'phone'],
  direccion: ['direccion', 'address'],
  entre_calles: ['entre_calles', 'entre calles'],
  cuit_cuil: ['cuit', 'cuit_cuil', 'cuil'],
  tipo_doc: ['tipo_doc', 'tipo documento'],
  nro_doc: ['nro_doc', 'numero_doc', 'documento', 'dni'],
  condicion_iva: ['condicion_iva', 'iva'],
  domicilio_fiscal: ['domicilio_fiscal'],
  provincia: ['provincia'],
  localidad: ['localidad', 'ciudad'],
  codigo_postal: ['codigo_postal', 'cp'],
  tipo_cliente: ['tipo_cliente', 'segmento_cliente'],
  segmento: ['segmento'],
  tags: ['tags', 'etiquetas'],
  estado: ['estado'],
};

const CLIENT_IMPORT_HEADER_LOOKUP = buildHeaderLookup(CLIENT_IMPORT_ALIASES);
const CLIENT_IMPORT_ASYNC_THRESHOLD = 200;

function normalizeClientImportRow(row, columnMap) {
  return {
    nombre: normalizeText(extractCellValue(row.getCell(columnMap.nombre))),
    apellido: normalizeText(extractCellValue(row.getCell(columnMap.apellido))),
    email: normalizeText(extractCellValue(row.getCell(columnMap.email))).toLowerCase(),
    telefono: normalizeText(extractCellValue(row.getCell(columnMap.telefono))),
    direccion: normalizeText(extractCellValue(row.getCell(columnMap.direccion))),
    entre_calles: normalizeText(extractCellValue(row.getCell(columnMap.entre_calles))),
    cuit_cuil: normalizeText(extractCellValue(row.getCell(columnMap.cuit_cuil))),
    tipo_doc: normalizeText(extractCellValue(row.getCell(columnMap.tipo_doc))),
    nro_doc: normalizeText(extractCellValue(row.getCell(columnMap.nro_doc))),
    condicion_iva: normalizeText(extractCellValue(row.getCell(columnMap.condicion_iva))),
    domicilio_fiscal: normalizeText(extractCellValue(row.getCell(columnMap.domicilio_fiscal))),
    provincia: normalizeText(extractCellValue(row.getCell(columnMap.provincia))),
    localidad: normalizeText(extractCellValue(row.getCell(columnMap.localidad))),
    codigo_postal: normalizeText(extractCellValue(row.getCell(columnMap.codigo_postal))),
    tipo_cliente: normalizeText(extractCellValue(row.getCell(columnMap.tipo_cliente))).toLowerCase(),
    segmento: normalizeText(extractCellValue(row.getCell(columnMap.segmento))),
    tags: normalizeText(extractCellValue(row.getCell(columnMap.tags))),
    estado: normalizeText(extractCellValue(row.getCell(columnMap.estado))).toLowerCase(),
  };
}

async function parseClientImportFile(file) {
  const worksheet = await loadWorksheet(file);
  const headerInfo = findHeaderRow(worksheet, CLIENT_IMPORT_HEADER_LOOKUP, ['nombre']);
  const columnMap = headerInfo.map || {};
  if (!columnMap.nombre) {
    throw new Error('Falta la columna nombre en el archivo de clientes');
  }

  const rows = [];
  const errors = [];
  const preview = [];
  const seenEmails = new Set();

  for (let rowIndex = headerInfo.rowIndex + 1; rowIndex <= (worksheet.rowCount || 0); rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    if (!row || row.actualCellCount === 0) continue;

    const data = normalizeClientImportRow(row, columnMap);
    if (!Object.values(data).some(Boolean)) continue;

    if (!data.nombre) {
      errors.push({ row: rowIndex, field: 'nombre', message: 'Nombre requerido' });
      continue;
    }
    if (
      data.tipo_cliente &&
      !['minorista', 'mayorista', 'distribuidor'].includes(data.tipo_cliente)
    ) {
      errors.push({
        row: rowIndex,
        field: 'tipo_cliente',
        message: 'Tipo de cliente invalido. Usa minorista, mayorista o distribuidor',
      });
      continue;
    }
    if (data.estado && !['activo', 'inactivo'].includes(data.estado)) {
      errors.push({ row: rowIndex, field: 'estado', message: 'Estado invalido' });
      continue;
    }
    if (data.email) {
      if (seenEmails.has(data.email)) {
        errors.push({ row: rowIndex, field: 'email', message: 'Email duplicado en el archivo' });
        continue;
      }
      seenEmails.add(data.email);
    }

    rows.push({ rowIndex, data });
    if (preview.length < 5) {
      preview.push({
        row: rowIndex,
        nombre: data.nombre,
        apellido: data.apellido || null,
        email: data.email || null,
        telefono: data.telefono || null,
        tipo_cliente: data.tipo_cliente || 'minorista',
        estado: data.estado || 'activo',
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

async function processClientImportRows(rows, { jobId, seedErrors = [] } = {}) {
  const result = {
    total: rows.length,
    created: 0,
    skipped: 0,
    errors: [],
  };

  if (jobId) {
    importJobs.startJob(jobId, {
      total_rows: rows.length,
      processed_rows: 0,
      created_rows: 0,
      skipped_rows: 0,
      message: 'Procesando importacion de clientes',
    });
  }

  for (const item of rows) {
    try {
      if (item.data.email) {
        const existing = await repo.findByEmail(item.data.email);
        if (existing) {
          result.skipped += 1;
          result.errors.push({
            row: item.rowIndex,
            field: 'email',
            message: 'Cliente ya existente con ese email',
          });
          if (jobId) {
            importJobs.updateJob(jobId, {
              processed_rows: result.created + result.skipped + result.errors.length,
              created_rows: result.created,
              skipped_rows: result.skipped,
            });
          }
          continue;
        }
      }

      const payload = applyWhatsappNormalization(
        {
          ...item.data,
          tipo_cliente: item.data.tipo_cliente || 'minorista',
          estado: item.data.estado || 'activo',
        },
        { partialUpdate: false }
      );
      await repo.create(payload);
      result.created += 1;
    } catch (error) {
      result.errors.push({
        row: item.rowIndex,
        field: 'cliente',
        message: error?.message || 'No se pudo crear el cliente',
      });
    }

    if (jobId) {
      importJobs.updateJob(jobId, {
        processed_rows: result.created + result.skipped + result.errors.length,
        created_rows: result.created,
        skipped_rows: result.skipped,
      });
    }
  }

  if (jobId) {
    importJobs.finishJob(jobId, {
      created_rows: result.created,
      skipped_rows: result.skipped,
      processed_rows: rows.length,
      errors: [...seedErrors, ...result.errors],
      message: `Importacion finalizada. ${result.created} clientes creados`,
      preview: [],
    });
  }

  return result;
}

const validateCreateOrUpdate = [
  check('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  check('apellido').optional().isString(),
  check('telefono').optional().isString(),
  check('telefono_e164').optional({ nullable: true }).isString().isLength({ max: 20 }),
  check('whatsapp_opt_in').optional().isBoolean(),
  check('whatsapp_opt_in_at').optional({ nullable: true }).isISO8601(),
  check('whatsapp_status').optional().isIn(WHATSAPP_STATUSES),
  check('whatsapp_last_error').optional({ nullable: true }).isString().isLength({ max: 500 }),
  check('email').optional().isEmail(),
  check('direccion').optional().isString(),
  check('entre_calles').optional().isString().isLength({ max: 255 }),
  check('cuit_cuil').optional().isString(),
  check('tipo_doc').optional().isString(),
  check('nro_doc').optional().isString(),
  check('condicion_iva').optional().isString(),
  check('domicilio_fiscal').optional().isString(),
  check('provincia').optional().isString(),
  check('localidad').optional().isString(),
  check('codigo_postal').optional().isString(),
  check('fecha_nacimiento').optional({ nullable: true }).isISO8601(),
  check('zona_id').optional({ nullable: true }).isInt({ min: 1 }),
  check('deposito_id').optional({ nullable: true }).isInt({ min: 1 }),
  check('responsable_usuario_id').optional({ nullable: true }).isInt({ min: 1 }),
  check('tipo_cliente').optional().isIn(['minorista','mayorista','distribuidor']),
  check('segmento').optional().isString(),
  check('tags').optional().isString(),
  check('estado').optional().isIn(['activo', 'inactivo']),
];

function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildClientBadRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function listAssignableResponsables(req, { depositoId = null, userIds = null } = {}) {
  const role = getRequestRole(req);
  const currentUserId = getRequestUserId(req);

  if (isOwnerScopedRole(role)) {
    if (!currentUserId) return [];
    return userRepo.listClientResponsibles({ userIds: [currentUserId] });
  }

  const visibility = await buildDepositoVisibility(req);
  let visibleDepositoIds = null;
  if (depositoId) visibleDepositoIds = [depositoId];
  else if (!isGlobalRole(role) && visibility.mode === 'restricted') {
    visibleDepositoIds = visibility.ids;
  }

  return userRepo.listClientResponsibles({
    visibleDepositoIds,
    userIds,
  });
}

async function resolveClientAssignment(
  req,
  {
    requestedDepositoId,
    requestedResponsableId,
    currentCliente = null,
    requireDeposito = false,
    requireResponsable = false,
  } = {}
) {
  const role = getRequestRole(req);
  const currentUserId = getRequestUserId(req);
  const hasRequestedDeposito = typeof requestedDepositoId !== 'undefined';
  const hasRequestedResponsable = typeof requestedResponsableId !== 'undefined';

  let depositoId = parseOptionalPositiveInt(currentCliente?.deposito_principal_id);
  if (hasRequestedDeposito) {
    depositoId = await resolveScopedDepositoId(req, requestedDepositoId);
  } else if (!depositoId && !isGlobalRole(role)) {
    depositoId = await resolveScopedDepositoId(req, null);
  }

  if (requireDeposito && !depositoId) {
    throw buildClientBadRequest('Selecciona una sucursal para el cliente');
  }

  let responsableUsuarioId = parseOptionalPositiveInt(currentCliente?.responsable_usuario_id);
  if (isOwnerScopedRole(role)) {
    if (!currentUserId) {
      throw buildClientBadRequest('No se pudo determinar el vendedor actual');
    }
    if (hasRequestedResponsable) {
      const requestedResponsable = parseOptionalPositiveInt(requestedResponsableId);
      if (!requestedResponsable || requestedResponsable !== currentUserId) {
        throw buildClientBadRequest('No puedes asignar clientes a otro vendedor');
      }
    }
    responsableUsuarioId = currentUserId;
  } else if (hasRequestedResponsable) {
    const requestedResponsable = parseOptionalPositiveInt(requestedResponsableId);
    if (!requestedResponsable) {
      throw buildClientBadRequest('Selecciona un responsable valido');
    }
    const matches = await listAssignableResponsables(req, {
      depositoId,
      userIds: [requestedResponsable],
    });
    if (!matches.length) {
      throw buildClientBadRequest('El responsable seleccionado no pertenece a la sucursal visible');
    }
    responsableUsuarioId = requestedResponsable;
  } else if (!responsableUsuarioId && role === 'gerente_sucursal' && currentUserId) {
    responsableUsuarioId = currentUserId;
  }

  if (requireResponsable && !responsableUsuarioId) {
    throw buildClientBadRequest('Selecciona un responsable para el cliente');
  }

  return { depositoId, responsableUsuarioId };
}

function applyWhatsappNormalization(payload, { partialUpdate = false } = {}) {
  const out = { ...(payload || {}) };
  const hasTelefono = Object.prototype.hasOwnProperty.call(out, 'telefono');
  const hasTelefonoE164 = Object.prototype.hasOwnProperty.call(out, 'telefono_e164');
  const hasOptIn = Object.prototype.hasOwnProperty.call(out, 'whatsapp_opt_in');
  const hasOptInAt = Object.prototype.hasOwnProperty.call(out, 'whatsapp_opt_in_at');
  const hasStatus = Object.prototype.hasOwnProperty.call(out, 'whatsapp_status');

  if (!partialUpdate || hasTelefono || hasTelefonoE164) {
    const sourceRaw = hasTelefonoE164 ? out.telefono_e164 : out.telefono;
    const normalized = normalizePhoneToE164(sourceRaw);
    out.telefono_e164 = normalized;
    if (!hasStatus) {
      out.whatsapp_status = deriveWhatsappStatus({
        telefonoRaw: hasTelefono ? out.telefono : sourceRaw,
        telefonoE164: normalized,
      });
    }
  }

  if (!partialUpdate || hasOptIn) {
    out.whatsapp_opt_in = Boolean(out.whatsapp_opt_in);
    if (out.whatsapp_opt_in && !out.telefono_e164) {
      const err = new Error(
        'No se puede activar WhatsApp sin un telefono valido en formato internacional'
      );
      err.status = 400;
      throw err;
    }
    if (out.whatsapp_opt_in) {
      if (!hasOptInAt || !out.whatsapp_opt_in_at) {
        out.whatsapp_opt_in_at = new Date().toISOString();
      }
      if (!hasStatus && (!out.whatsapp_status || out.whatsapp_status === 'unknown')) {
        out.whatsapp_status = 'pending_validation';
      }
    } else if (!hasOptInAt) {
      out.whatsapp_opt_in_at = null;
    }
  }

  return out;
}

const validateCreateInitialDebt = [
  check('monto').isFloat({ gt: 0 }).withMessage('Monto de deuda requerido'),
  check('fecha').optional().isISO8601().withMessage('Fecha inválida'),
  check('descripcion').optional().isString(),
];

const validateCreateInitialDebtPayment = [
  check('monto').isFloat({ gt: 0 }).withMessage('Monto de pago requerido'),
  check('fecha').optional().isISO8601().withMessage('Fecha inválida'),
  check('descripcion').optional().isString(),
];

async function list(req, res) {
  try {
    const {
      q,
      estado,
      tipo_cliente,
      segmento,
      limit,
      offset,
      all,
      view,
      responsable_usuario_id,
    } = req.query || {};
    const allowAll = String(all || '') === '1';
    const effectiveLimit = allowAll && (limit == null || limit === '') ? 10000 : limit;
    const clientVisibility = await buildClientVisibility(req);
    const requestedDepositoId = parseOptionalPositiveInt(req.query?.deposito_id);
    const depositoId = requestedDepositoId
      ? await resolveScopedDepositoId(req, requestedDepositoId)
      : null;
    const rows = await repo.list({
      q,
      estado,
      tipo_cliente,
      segmento,
      deposito_id: depositoId,
      responsable_usuario_id,
      clientVisibility,
      limit: effectiveLimit,
      offset,
      allowAll,
      view,
    });
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'No se pudieron obtener clientes' });
  }
}

async function importExcel(req, res) {
  const file = req.file;
  if (!file?.buffer) {
    return res.status(400).json({ error: 'Archivo requerido (.xlsx o .csv)' });
  }

  const dryRun = String(req.query?.dry_run || req.query?.preview || '').trim() === '1';
  const forceAsync = String(req.query?.async || '').trim() === '1';

  try {
    const parsed = await parseClientImportFile(file);

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

    if (forceAsync || parsed.rows.length > CLIENT_IMPORT_ASYNC_THRESHOLD) {
      const job = importJobs.createJob({
        type: 'clientes-import',
        fileName: file.originalname,
        totalRows: parsed.rows.length,
      });
      importJobs.updateJob(job.id, {
        preview: parsed.preview,
        errors: parsed.errors,
        skipped_rows: 0,
      });
      setImmediate(async () => {
        try {
          await processClientImportRows(parsed.rows, {
            jobId: job.id,
            seedErrors: parsed.errors,
          });
        } catch (error) {
          importJobs.failJob(job.id, {
            message: error?.message || 'Fallo la importacion de clientes',
          });
        }
      });

      return res.status(202).json({
        async: true,
        job: importJobs.getJob(job.id),
      });
    }

    const result = await processClientImportRows(parsed.rows);
    return res.json({
      async: false,
      total: parsed.totalRows,
      created: result.created,
      skipped: result.skipped,
      preview: parsed.preview,
      errors: [...parsed.errors, ...result.errors],
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'No se pudo importar el archivo de clientes' });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const payload = applyWhatsappNormalization(req.body, { partialUpdate: false });
    const { depositoId, responsableUsuarioId } = await resolveClientAssignment(req, {
      requestedDepositoId: req.body?.deposito_id,
      requestedResponsableId: req.body?.responsable_usuario_id,
      requireDeposito: true,
      requireResponsable: true,
    });
    const r = await repo.create({
      ...payload,
      deposito_principal_id: depositoId,
      responsable_usuario_id: responsableUsuarioId,
    });
    res.status(201).json({ id: r.id });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || 'No se pudo crear el cliente' });
  }
}

async function update(req, res) {
  const { id } = req.params;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const clientId = Number(id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ error: 'ID de cliente invalido' });
    }
    const currentCliente = await repo.findById(clientId);
    if (!currentCliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const payload = applyWhatsappNormalization(req.body, { partialUpdate: true });
    const hasDepositoUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, 'deposito_id');
    const hasResponsableUpdate = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'responsable_usuario_id'
    );
    const { depositoId, responsableUsuarioId } = await resolveClientAssignment(req, {
      requestedDepositoId: hasDepositoUpdate ? req.body?.deposito_id : undefined,
      requestedResponsableId: hasResponsableUpdate ? req.body?.responsable_usuario_id : undefined,
      currentCliente,
    });

    const updatePayload = { ...payload };
    delete updatePayload.deposito_id;
    delete updatePayload.responsable_usuario_id;

    if (hasDepositoUpdate || (!currentCliente.deposito_principal_id && depositoId)) {
      updatePayload.deposito_principal_id = depositoId;
    }
    if (hasResponsableUpdate || (!currentCliente.responsable_usuario_id && responsableUsuarioId)) {
      updatePayload.responsable_usuario_id = responsableUsuarioId;
    }

    const r = await repo.update(clientId, updatePayload);
    if (!r) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente actualizado' });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || 'No se pudo actualizar el cliente' });
  }
}

async function remove(req, res) {
  const { id } = req.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  try {
    const r = await repo.remove(idNum);
    if (!r) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json({ message: 'Cliente enviado a papelera' });
  } catch (e) {
    const status = e.status || 500;
    const message = e.message || 'No se pudo eliminar el cliente';
    res.status(status).json({ error: message, code: e.code || null });
  }
}

async function listDeleted(req, res) {
  try {
    const rows = await repo.list({
      q: req.query.q,
      limit: req.query.limit,
      offset: req.query.offset,
      onlyDeleted: true,
      view: req.query.view,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la papelera de clientes' });
  }
}

async function listVisibleResponsables(req, res) {
  try {
    const requestedDepositoId = parseOptionalPositiveInt(req.query?.deposito_id);
    const depositoId = requestedDepositoId
      ? await resolveScopedDepositoId(req, requestedDepositoId)
      : null;
    const rows = await listAssignableResponsables(req, { depositoId });
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message || 'No se pudieron obtener los responsables visibles',
    });
  }
}

async function restore(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente invalido' });
  }
  try {
    const restored = await repo.restore(idNum);
    if (!restored) {
      return res.status(404).json({ error: 'Cliente no encontrado en papelera' });
    }
    res.json({ message: 'Cliente restaurado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo restaurar el cliente' });
  }
}

async function listInitialDebts(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  try {
    const rows = await debtRepo.listByClient(idNum);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las deudas iniciales del cliente' });
  }
}

async function addInitialDebt(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { monto, fecha, descripcion } = req.body || {};
    const created = await debtRepo.createForClient(idNum, {
      monto: Number(monto),
      fecha: fecha || null,
      descripcion: descripcion || null,
    });
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo registrar la deuda inicial del cliente' });
  }
}

async function listInitialDebtPayments(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  try {
    const rows = await debtRepo.listPaymentsByClient(idNum);
    res.json(rows);
  } catch (e) {
    res
      .status(500)
      .json({ error: 'No se pudieron obtener los pagos de deuda inicial del cliente' });
  }
}

async function addInitialDebtPayment(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { monto, fecha, descripcion } = req.body || {};
    const created = await debtRepo.createPaymentForClient(idNum, {
      monto: Number(monto),
      fecha: fecha || null,
      descripcion: descripcion || null,
    });
    res.status(201).json(created);
  } catch (e) {
    res
      .status(500)
      .json({ error: 'No se pudo registrar el pago de deuda inicial del cliente' });
  }
}

async function listPaymentHistory(req, res) {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 200);
  const off = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  try {
    const requestedDepositoId = parseOptionalPositiveInt(req.query?.deposito_id);
    const depositoId = requestedDepositoId
      ? await resolveScopedDepositoId(req, requestedDepositoId)
      : null;
    const rows = await repo.listPaymentHistory(idNum, {
      limit: lim,
      offset: off,
      deposito_id: depositoId,
    });
    res.json(rows);
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ error: e.message || 'No se pudo obtener el historial de pagos' });
  }
}

const validateRecalculateSegments = [
  check('cliente_id').optional({ nullable: true }).isInt({ gt: 0 }),
  check('limit').optional({ nullable: true }).isInt({ gt: 0, lt: 5001 }),
];

async function recalculateSegments(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const summary = await clientSegmentationService.recalculateSegments({
      clienteId: req.body?.cliente_id != null ? Number(req.body.cliente_id) : null,
      limit: req.body?.limit != null ? Number(req.body.limit) : undefined,
    });

    res.json({
      message: 'Prioridades actualizadas',
      ...summary,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron recalcular las prioridades de clientes' });
  }
}

async function listVisibleResponsables(req, res) {
  try {
    const requestedDepositoId = parseOptionalPositiveInt(req.query?.deposito_id);
    const depositoId = requestedDepositoId
      ? await resolveScopedDepositoId(req, requestedDepositoId)
      : null;
    const rows = await listAssignableResponsables(req, { depositoId });
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message || 'No se pudieron obtener los responsables visibles',
    });
  }
}

// ─── Eliminación de pagos ─────────────────────────────────────────────────────

async function deleteSalePayment(req, res) {
  const clienteId = Number(req.params.id);
  const pagoId = Number(req.params.pagoId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: 'ID de cliente invalido' });
  }
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return res.status(400).json({ error: 'ID de pago invalido' });
  }

  try {
    const pago = await paymentRepo.findById(pagoId);
    if (!pago || Number(pago.cliente_id) !== clienteId) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    await paymentRepo.eliminarPago(pagoId);
    res.json({ message: 'Pago eliminado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo eliminar el pago' });
  }
}

async function deleteInitialDebtPayment(req, res) {
  const clienteId = Number(req.params.id);
  const pagoId = Number(req.params.pagoId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: 'ID de cliente invalido' });
  }
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return res.status(400).json({ error: 'ID de pago invalido' });
  }
  try {
    const deleted = await debtRepo.deletePaymentForClient(clienteId, pagoId);
    if (!deleted) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    res.json({ message: 'Pago eliminado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo eliminar el pago' });
  }
}

// ─── Exports (único punto de exportación) ────────────────────────────────────

module.exports = {
  list,
  listVisibleResponsables,
  importExcel,
  create: [...validateCreateOrUpdate, create],
  update: [...validateCreateOrUpdate, update],
  remove,
  listDeleted,
  restore,
  listInitialDebts,
  addInitialDebt: [...validateCreateInitialDebt, addInitialDebt],
  listInitialDebtPayments,
  addInitialDebtPayment: [...validateCreateInitialDebtPayment, addInitialDebtPayment],
  listPaymentHistory,
  recalculateSegments: [...validateRecalculateSegments, recalculateSegments],
  deleteSalePayment,
  deleteInitialDebtPayment,
};
