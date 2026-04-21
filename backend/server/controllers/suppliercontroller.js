const { check, validationResult } = require('express-validator');
const repo = require('../db/repositories/supplierRepository');
const comprasRepo = require('../db/repositories/purchaseRepository');
const { tableExists } = require('../db/schemaSupport');

const validateCreate = [
  check('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  check('email').optional().isEmail(),
  check('telefono').optional().isString(),
  check('whatsapp').optional().isString().isLength({ max: 50 }),
  check('direccion').optional().isString(),
  check('cuit_cuil').optional().isString(),
  check('alias_cuenta').optional().isString().isLength({ max: 120 }),
  check('cbu').optional().isString().isLength({ max: 40 }),
  check('banco').optional().isString().isLength({ max: 120 }),
  check('activo').optional().isBoolean(),
  check('notas_internas').optional().isString(),
  check('tiempo_reposicion_dias').optional({ nullable: true }).isInt({ min: 0, max: 365 }),
];

async function list(req, res) {
  try {
    const { q, limit, offset } = req.query || {};
    const rows = await repo.list({ q, limit, offset });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener proveedores' });
  }
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const r = await repo.create(req.body);
    res.status(201).json({ id: r.id });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear el proveedor' });
  }
}

async function update(req, res) {
  const { id } = req.params;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const r = await repo.update(Number(id), req.body);
    if (!r) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ message: 'Proveedor actualizado' });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar el proveedor' });
  }
}

async function compras(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const { limit, offset } = req.query || {};
    const rows = await comprasRepo.listarComprasPorProveedor({ proveedor_id: id, limit, offset });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener compras del proveedor' });
  }
}

async function cuentaCorriente(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido' });
  }
  try {
    const hasLedger = await tableExists('proveedores_cuenta_corriente');
    if (!hasLedger) {
      return res.status(409).json({ error: 'La cuenta empresa todavia no esta lista en la base. Ejecuta la migracion V35.' });
    }
    const [proveedor, resumen, movimientos] = await Promise.all([
      repo.findById(id),
      repo.getProveedorCuentaCorrienteResumen(id),
      repo.getProveedorCuentaCorrienteDetalle(id, req.query || {}),
    ]);
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({
      proveedor,
      resumen,
      movimientos,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la cuenta corriente del proveedor' });
  }
}

async function cuentasEmpresaActivas(_req, res) {
  try {
    const rows = await repo.listCuentaEmpresaProviders();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener las cuentas empresa disponibles' });
  }
}

module.exports = {
  list,
  create: [...validateCreate, create],
  update: [...validateCreate, update],
  compras,
  cuentaCorriente,
  cuentasEmpresaActivas,
};
