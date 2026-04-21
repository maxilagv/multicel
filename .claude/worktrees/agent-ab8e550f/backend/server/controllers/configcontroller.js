const { check, validationResult } = require('express-validator');
const { withTransaction } = require('../db/pg');
const configRepo = require('../db/repositories/configRepository');
const audit = require('../services/auditService');

const PRICE_LABEL_KEYS = {
  local: 'price_label_local',
  distribuidor: 'price_label_distribuidor',
  final: 'price_label_final',
};

const PRICE_LABEL_DEFAULTS = {
  local: 'Precio Distribuidor',
  distribuidor: 'Precio Mayorista',
  final: 'Precio Final',
};

const RANKING_METRIC_KEY = 'ranking_vendedores_metrica';
const RANKING_METRIC_DEFAULT = 'cantidad_ventas';
const RANKING_METRIC_OPTIONS = ['cantidad_ventas', 'margen_venta'];

async function getDolarBlue(req, res) {
  try {
    const valor = await configRepo.getDolarBlue();
    res.json({
      clave: 'dolar_blue',
      valor: valor != null ? valor : null,
    });
  } catch (e) {
    console.error('Error obteniendo dolar_blue:', e);
    res.status(500).json({ error: 'No se pudo obtener el valor de dólar blue' });
  }
}

async function getDebtThreshold(req, res) {
  try {
    const valor = await configRepo.getDebtThreshold();
    res.json({
      clave: 'deuda_umbral_rojo',
      valor: valor != null ? valor : null,
    });
  } catch (e) {
    console.error('Error obteniendo deuda_umbral_rojo:', e);
    res.status(500).json({ error: 'No se pudo obtener el umbral de deuda' });
  }
}

const validateSetDolarBlue = [
  check('valor')
    .notEmpty()
    .withMessage('valor es requerido')
    .isFloat({ gt: 0 })
    .withMessage('valor debe ser un número mayor a 0'),
];

const validateSetDebtThreshold = [
  check('valor')
    .notEmpty()
    .withMessage('valor es requerido')
    .isFloat({ gt: 0 })
    .withMessage('valor debe ser un nÃºmero mayor a 0'),
];

async function setDolarBlueHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const valor = Number(req.body?.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    return res.status(400).json({ error: 'Valor de dólar inválido' });
  }

  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null;

  try {
    await withTransaction(async (client) => {
      const { rows: prevRows } = await client.query(
        'SELECT valor_num FROM parametros_sistema WHERE clave = $1 LIMIT 1',
        ['dolar_blue']
      );
      const prevValor = Number(prevRows?.[0]?.valor_num || 0);
      const ratio = prevValor > 0 ? valor / prevValor : null;
      // 1) Actualizar parámetro de sistema
      await client.query(
        `INSERT INTO parametros_sistema(clave, valor_num, usuario_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (clave) DO UPDATE
           SET valor_num = EXCLUDED.valor_num,
               usuario_id = EXCLUDED.usuario_id,
               actualizado_en = NOW()`,
        ['dolar_blue', valor, usuarioId || null]
      );

      // 2) Recalcular precios de todos los productos activos en base al costo en USD
      //    Solo para productos con costo en dólares > 0
      await client.query(
        `UPDATE productos
            SET tipo_cambio = $1,
                precio_costo = ROUND(precio_costo_dolares * $1, 2),
                precio_costo_pesos = ROUND(precio_costo_dolares * $1, 2),
                precio_local = ROUND(precio_costo_dolares * $1 * (1 + margen_local), 2),
                precio_distribuidor = ROUND(precio_costo_dolares * $1 * (1 + margen_distribuidor), 2),
                precio_venta = ROUND(precio_costo_dolares * $1 * (1 + margen_local), 2),
                actualizado_en = CURRENT_TIMESTAMP
          WHERE activo = TRUE
            AND precio_costo_dolares > 0
            AND COALESCE(precio_modo, 'auto') <> 'manual'`
        ,
        [valor]
      );

      if (ratio && Number.isFinite(ratio)) {
        await client.query(
          `UPDATE productos
              SET tipo_cambio = $1,
                  precio_costo = ROUND(precio_costo_dolares * $1, 2),
                  precio_costo_pesos = ROUND(precio_costo_dolares * $1, 2),
                  precio_local = ROUND(precio_local * $2, 2),
                  precio_distribuidor = ROUND(precio_distribuidor * $2, 2),
                  precio_final = ROUND(precio_final * $2, 2),
                  precio_venta = ROUND(precio_venta * $2, 2),
                  actualizado_en = CURRENT_TIMESTAMP
          WHERE activo = TRUE
            AND COALESCE(precio_modo, 'auto') = 'manual'`,
          [valor, ratio]
        );
      } else {
        await client.query(
          `UPDATE productos
              SET tipo_cambio = $1,
                  precio_costo = ROUND(precio_costo_dolares * $1, 2),
                  precio_costo_pesos = ROUND(precio_costo_dolares * $1, 2),
                  actualizado_en = CURRENT_TIMESTAMP
            WHERE activo = TRUE
              AND COALESCE(precio_modo, 'auto') = 'manual'`,
          [valor]
        );
      }

      // 3) Registrar historial de precios para trazabilidad
      await client.query(
        `INSERT INTO productos_historial(
           producto_id,
           proveedor_id,
           costo_pesos,
           costo_dolares,
           tipo_cambio,
           margen_local,
           margen_distribuidor,
           precio_local,
           precio_distribuidor,
           usuario_id
         )
         SELECT
           p.id,
           p.proveedor_id,
           ROUND(p.precio_costo_dolares * $1, 2) AS costo_pesos,
           p.precio_costo_dolares AS costo_dolares,
           $1 AS tipo_cambio,
           p.margen_local,
           p.margen_distribuidor,
           p.precio_local AS precio_local,
           p.precio_distribuidor AS precio_distribuidor,
           $2 AS usuario_id
         FROM productos p
         WHERE p.activo = TRUE
           AND p.precio_costo_dolares > 0`,
        [valor, usuarioId || null]
      );
    });

    res.json({
      clave: 'dolar_blue',
      valor,
      message: 'Dólar blue actualizado y precios recalculados',
    });
  } catch (e) {
    console.error('Error guardando dolar_blue y recalculando precios:', e);
    res
      .status(500)
      .json({ error: 'No se pudo guardar el valor de dólar blue ni recalcular precios' });
  }
}

async function setDebtThresholdHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const valor = Number(req.body?.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    return res.status(400).json({ error: 'Umbral de deuda invalido' });
  }

  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null;

  try {
    await configRepo.setDebtThreshold(valor, usuarioId);
    res.json({
      clave: 'deuda_umbral_rojo',
      valor,
      message: 'Umbral de deuda actualizado',
    });
  } catch (e) {
    console.error('Error guardando deuda_umbral_rojo:', e);
    res.status(500).json({ error: 'No se pudo guardar el umbral de deuda' });
  }
}

async function getPriceLabels(req, res) {
  try {
    const [local, distribuidor, finalLabel] = await Promise.all([
      configRepo.getTextParam(PRICE_LABEL_KEYS.local),
      configRepo.getTextParam(PRICE_LABEL_KEYS.distribuidor),
      configRepo.getTextParam(PRICE_LABEL_KEYS.final),
    ]);
    res.json({
      local: local || PRICE_LABEL_DEFAULTS.local,
      distribuidor: distribuidor || PRICE_LABEL_DEFAULTS.distribuidor,
      final: finalLabel || PRICE_LABEL_DEFAULTS.final,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los nombres de precios' });
  }
}

const validateSetPriceLabels = [
  check('local').optional().isString().isLength({ min: 1, max: 120 }),
  check('distribuidor').optional().isString().isLength({ min: 1, max: 120 }),
  check('final').optional().isString().isLength({ min: 1, max: 120 }),
];

async function setPriceLabelsHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null;
  try {
    const { local, distribuidor, final: finalLabel } = req.body || {};
    if (typeof local !== 'undefined') {
      await configRepo.setTextParam(PRICE_LABEL_KEYS.local, String(local).trim(), usuarioId);
    }
    if (typeof distribuidor !== 'undefined') {
      await configRepo.setTextParam(PRICE_LABEL_KEYS.distribuidor, String(distribuidor).trim(), usuarioId);
    }
    if (typeof finalLabel !== 'undefined') {
      await configRepo.setTextParam(PRICE_LABEL_KEYS.final, String(finalLabel).trim(), usuarioId);
    }
    return getPriceLabels(req, res);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron guardar los nombres de precios' });
  }
}

async function getRankingMetric(req, res) {
  try {
    const value = await configRepo.getTextParam(RANKING_METRIC_KEY);
    const normalized = RANKING_METRIC_OPTIONS.includes(String(value || '').trim())
      ? String(value).trim()
      : RANKING_METRIC_DEFAULT;
    res.json({ clave: RANKING_METRIC_KEY, valor: normalized });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la configuracion de ranking' });
  }
}

const validateSetRankingMetric = [
  check('valor').isIn(RANKING_METRIC_OPTIONS),
];

async function setRankingMetric(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null;
  try {
    const value = String(req.body?.valor || '').trim();
    await configRepo.setTextParam(RANKING_METRIC_KEY, value, usuarioId);
    res.json({ clave: RANKING_METRIC_KEY, valor: value });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo guardar la configuracion de ranking' });
  }
}

module.exports = {
  getDolarBlue,
  setDolarBlue: [...validateSetDolarBlue, setDolarBlueHandler],
  getDebtThreshold,
  setDebtThreshold: [...validateSetDebtThreshold, setDebtThresholdHandler],
  getPriceLabels,
  setPriceLabels: [...validateSetPriceLabels, setPriceLabelsHandler],
  getRankingMetric,
  setRankingMetric: [...validateSetRankingMetric, setRankingMetric],
  resetPanelData: resetPanelDataHandler,
};

async function resetPanelDataHandler(req, res) {
  const usuarioId =
    (req.authUser && req.authUser.id) ||
    (req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null);

  try {
      await withTransaction(async (client) => {
        const tables = [
          'logs',
          'crm_actividades',
          'crm_oportunidades',
          'ticket_eventos',
          'tickets',
          'aprobaciones_historial',
          'aprobaciones',
          'productos_historial',
          'producto_imagenes',
          'movimientos_stock',
          'stock_ajustes',
          'inventario_depositos',
          'compras_detalle',
          'recepciones_detalle',
          'recepciones',
          'compras',
          'ventas_detalle',
          'pagos_metodos',
          'pagos',
          'facturas',
          'ventas',
          'gastos',
          'inversiones',
          'pagos_proveedores',
          'metodos_pago',
          'proveedores',
          'categorias',
          'productos',
          'clientes_deudas_iniciales_pagos',
          'clientes_deudas_iniciales',
          'clientes_refresh_tokens',
          'clientes_auth',
          'clientes',
          'OrderItems',
          'Orders',
          'Products',
        ];
        for (const table of tables) {
          const exists = await client.query(
            `SELECT 1
               FROM information_schema.tables
              WHERE table_schema = DATABASE()
                AND table_name = $1
              LIMIT 1`,
            [table]
          );
          if (!exists.rows.length) continue;
          await client.query(`DELETE FROM ${table}`);
        }
      });

    await audit.log({
      usuario_id: usuarioId || null,
      accion: 'reset_datos_panel',
      tabla_afectada: '*',
      registro_id: null,
      descripcion:
        'Limpieza manual de datos del panel (clientes, productos, ventas, etc.)',
    });

    res.json({
      message:
        'Datos del panel limpiados correctamente. Usuarios y login se mantienen intactos.',
    });
  } catch (e) {
    console.error('Error reseteando datos del panel:', e);
    res
      .status(500)
      .json({ error: 'No se pudieron limpiar los datos del panel' });
  }
}
