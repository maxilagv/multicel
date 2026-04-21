const { check, validationResult } = require('express-validator');
const { withTransaction } = require('../db/pg');
const configRepo = require('../db/repositories/configRepository');
const priceListRepo = require('../db/repositories/priceListRepository');
const logger = require('../lib/logger');
const audit = require('../services/auditService');
const { normalizeStep, VALID_STEPS } = require('../lib/priceUtils');

const PRICE_LABEL_KEYS = {
  local: 'price_label_local',
  distribuidor: 'price_label_distribuidor',
  final: 'price_label_final',
};

const PRICE_LABEL_DEFAULTS = {
  local: 'Precio Local',
  distribuidor: 'Precio Distribuidor',
  final: 'Precio Final',
};

// Módulos que el admin puede activar/desactivar por tenant
const TOGGLEABLE_MODULE_KEYS = [
  'rankings',
  'compras',
  'proveedores',
  'medicina-laboral',
  'ordenes-servicio',
  'fabricacion',
  'catalogo',
  'ofertas',
  'crm',
  'postventa',
  'marketplace',
  'arca',
  'sueldos-vendedores',
  'multideposito',
  'predicciones',
  'aprobaciones',
  'alertas',
  'integraciones',
];

const RANKING_METRIC_KEY = 'ranking_vendedores_metrica';
const RANKING_METRIC_DEFAULT = 'cantidad_ventas';
const RANKING_METRIC_OPTIONS = ['cantidad_ventas', 'margen_venta'];
const BUSINESS_PROFILE_KEYS = {
  name: 'business_name',
  address: 'business_address',
  logoUrl: 'business_logo_url',
  clientMode: 'onboarding_client_mode',
};

async function getDolarBlue(req, res) {
  try {
    const valor = await configRepo.getDolarBlue();
    res.json({
      clave: 'dolar_blue',
      valor: valor != null ? valor : null,
    });
  } catch (e) {
    logger.error({ err: e }, 'Error obteniendo dolar_blue:');
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
    logger.error({ err: e }, 'Error obteniendo deuda_umbral_rojo:');
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
    // Leer el step de redondeo configurado antes de la transacción
    const rawStep = await configRepo.getPriceRoundingStep();
    const step = normalizeStep(rawStep);

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
      //    ROUND(value / step) * step aplica el redondeo configurable
      await client.query(
        `UPDATE productos
            SET tipo_cambio = $1,
                precio_costo = ROUND(precio_costo_dolares * $1 / $2) * $2,
                precio_costo_pesos = ROUND(precio_costo_dolares * $1 / $2) * $2,
                precio_local = ROUND(precio_costo_dolares * $1 * (1 + margen_local) / $2) * $2,
                precio_distribuidor = ROUND(precio_costo_dolares * $1 * (1 + margen_distribuidor) / $2) * $2,
                precio_venta = ROUND(precio_costo_dolares * $1 * (1 + margen_local) / $2) * $2,
                actualizado_en = CURRENT_TIMESTAMP
          WHERE activo = TRUE
            AND precio_costo_dolares > 0
            AND COALESCE(precio_modo, 'auto') <> 'manual'`,
        [valor, step]
      );

      if (ratio && Number.isFinite(ratio)) {
        await client.query(
          `UPDATE productos
              SET tipo_cambio = $1,
                  precio_costo = ROUND(precio_costo_dolares * $1 / $3) * $3,
                  precio_costo_pesos = ROUND(precio_costo_dolares * $1 / $3) * $3,
                  precio_local = ROUND(precio_local * $2 / $3) * $3,
                  precio_distribuidor = ROUND(precio_distribuidor * $2 / $3) * $3,
                  precio_final = ROUND(precio_final * $2 / $3) * $3,
                  precio_venta = ROUND(precio_venta * $2 / $3) * $3,
                  actualizado_en = CURRENT_TIMESTAMP
          WHERE activo = TRUE
            AND COALESCE(precio_modo, 'auto') = 'manual'`,
          [valor, ratio, step]
        );
      } else {
        await client.query(
          `UPDATE productos
              SET tipo_cambio = $1,
                  precio_costo = ROUND(precio_costo_dolares * $1 / $2) * $2,
                  precio_costo_pesos = ROUND(precio_costo_dolares * $1 / $2) * $2,
                  actualizado_en = CURRENT_TIMESTAMP
            WHERE activo = TRUE
              AND COALESCE(precio_modo, 'auto') = 'manual'`,
          [valor, step]
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

      await priceListRepo.syncAllProductPriceRowsTx(client, {
        motivo: 'update_dolar_blue',
        usuarioId,
        recordHistory: false,
      });
    });

    res.json({
      clave: 'dolar_blue',
      valor,
      message: 'Dólar blue actualizado y precios recalculados',
    });
  } catch (e) {
    logger.error({ err: e }, 'Error guardando dolar_blue y recalculando precios:');
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
    logger.error({ err: e }, 'Error guardando deuda_umbral_rojo:');
    res.status(500).json({ error: 'No se pudo guardar el umbral de deuda' });
  }
}

async function getPriceLabels(req, res) {
  try {
    const [local, distribuidor, finalLabel, localEnabled, distEnabled] = await Promise.all([
      configRepo.getTextParam(PRICE_LABEL_KEYS.local),
      configRepo.getTextParam(PRICE_LABEL_KEYS.distribuidor),
      configRepo.getTextParam(PRICE_LABEL_KEYS.final),
      configRepo.getNumericParam('price_enabled_local'),
      configRepo.getNumericParam('price_enabled_distribuidor'),
    ]);
    res.json({
      local: local || PRICE_LABEL_DEFAULTS.local,
      distribuidor: distribuidor || PRICE_LABEL_DEFAULTS.distribuidor,
      final: finalLabel || PRICE_LABEL_DEFAULTS.final,
      // null → nunca se configuró → habilitado por defecto
      local_enabled: localEnabled !== 0,
      distribuidor_enabled: distEnabled !== 0,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener los nombres de precios' });
  }
}

const validateSetPriceLabels = [
  check('local').optional().isString().isLength({ min: 1, max: 120 }),
  check('distribuidor').optional().isString().isLength({ min: 1, max: 120 }),
  check('final').optional().isString().isLength({ min: 1, max: 120 }),
  check('local_enabled').optional().isBoolean().toBoolean(),
  check('distribuidor_enabled').optional().isBoolean().toBoolean(),
];

async function setPriceLabelsHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null;

  try {
    const { local, distribuidor, final: finalLabel, local_enabled, distribuidor_enabled } = req.body || {};
    const saves = [];

    if (typeof local !== 'undefined') {
      saves.push(configRepo.setTextParam(PRICE_LABEL_KEYS.local, String(local).trim(), usuarioId));
    }
    if (typeof distribuidor !== 'undefined') {
      saves.push(configRepo.setTextParam(PRICE_LABEL_KEYS.distribuidor, String(distribuidor).trim(), usuarioId));
    }
    if (typeof finalLabel !== 'undefined') {
      saves.push(configRepo.setTextParam(PRICE_LABEL_KEYS.final, String(finalLabel).trim(), usuarioId));
    }
    if (typeof local_enabled !== 'undefined') {
      saves.push(configRepo.setNumericParam('price_enabled_local', local_enabled ? 1 : 0, usuarioId));
    }
    if (typeof distribuidor_enabled !== 'undefined') {
      saves.push(configRepo.setNumericParam('price_enabled_distribuidor', distribuidor_enabled ? 1 : 0, usuarioId));
    }

    await Promise.all(saves);

    try {
      const lists = await priceListRepo.listPriceLists({ includeInactive: true });
      const byLegacyCode = new Map(
        (lists || [])
          .filter((item) => item.legacy_code)
          .map((item) => [String(item.legacy_code), item])
      );
      const listUpdates = [];
      if (typeof local !== 'undefined' || typeof local_enabled !== 'undefined') {
        const legacyLocal = byLegacyCode.get('local');
        if (legacyLocal?.id) {
          listUpdates.push(
            priceListRepo.updatePriceList(
              legacyLocal.id,
              {
                ...(typeof local !== 'undefined' ? { nombre: String(local).trim() } : {}),
                ...(typeof local_enabled !== 'undefined' ? { activo: Boolean(local_enabled) } : {}),
              },
              { usuarioId }
            )
          );
        }
      }
      if (typeof distribuidor !== 'undefined' || typeof distribuidor_enabled !== 'undefined') {
        const legacyDistribuidor = byLegacyCode.get('distribuidor');
        if (legacyDistribuidor?.id) {
          listUpdates.push(
            priceListRepo.updatePriceList(
              legacyDistribuidor.id,
              {
                ...(typeof distribuidor !== 'undefined'
                  ? { nombre: String(distribuidor).trim() }
                  : {}),
                ...(typeof distribuidor_enabled !== 'undefined'
                  ? { activo: Boolean(distribuidor_enabled) }
                  : {}),
              },
              { usuarioId }
            )
          );
        }
      }
      if (typeof finalLabel !== 'undefined') {
        const legacyFinal = byLegacyCode.get('final');
        if (legacyFinal?.id) {
          listUpdates.push(
            priceListRepo.updatePriceList(
              legacyFinal.id,
              { nombre: String(finalLabel).trim() },
              { usuarioId }
            )
          );
        }
      }
      if (listUpdates.length) {
        await Promise.all(listUpdates);
      }
    } catch {
      // Si la tabla nueva todavia no existe, mantenemos compatibilidad legacy.
    }

    return getPriceLabels(req, res);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron guardar los nombres de precios' });
  }
}

// ── Módulos por tenant ────────────────────────────────────────────────────────

async function getModulesHandler(req, res) {
  try {
    const saved = await configRepo.getModulesConfig();
    const result = TOGGLEABLE_MODULE_KEYS.map((key) => ({
      key,
      enabled: saved[key] !== false,
    }));
    res.json(result);
  } catch (e) {
    logger.error({ err: e }, 'Error obteniendo modules_config');
    res.status(500).json({ error: 'No se pudo obtener la configuración de módulos' });
  }
}

async function setModulesHandler(req, res) {
  const updates = req.body;
  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Se esperaba un array de módulos' });
  }

  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null;

  try {
    const config = {};
    for (const item of updates) {
      if (typeof item.key === 'string' && TOGGLEABLE_MODULE_KEYS.includes(item.key)) {
        config[item.key] = Boolean(item.enabled);
      }
    }
    await configRepo.setModulesConfig(config, usuarioId);

    const result = TOGGLEABLE_MODULE_KEYS.map((key) => ({
      key,
      enabled: config[key] !== false,
    }));
    res.json(result);
  } catch (e) {
    logger.error({ err: e }, 'Error guardando modules_config');
    res.status(500).json({ error: 'No se pudieron guardar los módulos' });
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

async function getBusinessProfile(req, res) {
  try {
    const [name, address, logoUrl, catalogName, catalogLogo, clientMode] = await Promise.all([
      configRepo.getTextParam(BUSINESS_PROFILE_KEYS.name),
      configRepo.getTextParam(BUSINESS_PROFILE_KEYS.address),
      configRepo.getTextParam(BUSINESS_PROFILE_KEYS.logoUrl),
      configRepo.getTextParam('catalogo_nombre'),
      configRepo.getTextParam('catalogo_logo_url'),
      configRepo.getTextParam(BUSINESS_PROFILE_KEYS.clientMode),
    ]);

    res.json({
      nombre: name || catalogName || '',
      direccion: address || '',
      logo_url: logoUrl || catalogLogo || '',
      client_mode: clientMode || 'manual',
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el perfil del negocio' });
  }
}

const validateSetBusinessProfile = [
  check('nombre').optional().isString().isLength({ min: 1, max: 120 }),
  check('direccion').optional({ nullable: true }).isString().isLength({ max: 255 }),
  check('logo_url').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  check('client_mode').optional().isIn(['manual', 'anonymous', 'later']),
];

async function setBusinessProfile(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null;

  try {
    const { nombre, direccion, logo_url, client_mode } = req.body || {};
    if (typeof nombre !== 'undefined') {
      const normalized = String(nombre || '').trim();
      await Promise.all([
        configRepo.setTextParam(BUSINESS_PROFILE_KEYS.name, normalized, usuarioId),
        configRepo.setTextParam('catalogo_nombre', normalized, usuarioId),
      ]);
    }
    if (typeof direccion !== 'undefined') {
      await configRepo.setTextParam(
        BUSINESS_PROFILE_KEYS.address,
        String(direccion || '').trim(),
        usuarioId
      );
    }
    if (typeof logo_url !== 'undefined') {
      const normalizedLogo = String(logo_url || '').trim();
      await Promise.all([
        configRepo.setTextParam(BUSINESS_PROFILE_KEYS.logoUrl, normalizedLogo, usuarioId),
        configRepo.setTextParam('catalogo_logo_url', normalizedLogo, usuarioId),
      ]);
    }
    if (typeof client_mode !== 'undefined') {
      await configRepo.setTextParam(BUSINESS_PROFILE_KEYS.clientMode, String(client_mode), usuarioId);
    }
    return getBusinessProfile(req, res);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo guardar el perfil del negocio' });
  }
}

async function getPriceRounding(req, res) {
  try {
    const step = await configRepo.getPriceRoundingStep();
    res.json({ clave: 'precio_redondeo_step', valor: normalizeStep(step), opciones: VALID_STEPS });
  } catch (e) {
    logger.error({ err: e }, 'Error obteniendo precio_redondeo_step');
    res.status(500).json({ error: 'No se pudo obtener la configuración de redondeo' });
  }
}

const validateSetPriceRounding = [
  check('valor').isIn(VALID_STEPS).withMessage(`Debe ser uno de: ${VALID_STEPS.join(', ')}`),
];

async function setPriceRoundingHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const step = normalizeStep(req.body?.valor);
  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub))
      ? Number(req.user.sub)
      : null;

  try {
    await configRepo.setPriceRoundingStep(step, usuarioId);
    res.json({ clave: 'precio_redondeo_step', valor: step, opciones: VALID_STEPS });
  } catch (e) {
    logger.error({ err: e }, 'Error guardando precio_redondeo_step');
    res.status(500).json({ error: 'No se pudo guardar la configuración de redondeo' });
  }
}

module.exports = {
  getDolarBlue,
  setDolarBlue: [...validateSetDolarBlue, setDolarBlueHandler],
  getDebtThreshold,
  setDebtThreshold: [...validateSetDebtThreshold, setDebtThresholdHandler],
  getPriceLabels,
  setPriceLabels: [...validateSetPriceLabels, setPriceLabelsHandler],
  getPriceRounding,
  setPriceRounding: [...validateSetPriceRounding, setPriceRoundingHandler],
  getRankingMetric,
  setRankingMetric: [...validateSetRankingMetric, setRankingMetric],
  getBusinessProfile,
  setBusinessProfile: [...validateSetBusinessProfile, setBusinessProfile],
  resetPanelData: resetPanelDataHandler,
  getModules: getModulesHandler,
  setModules: setModulesHandler,
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
    logger.error({ err: e }, 'Error reseteando datos del panel:');
    res
      .status(500)
      .json({ error: 'No se pudieron limpiar los datos del panel' });
  }
}
