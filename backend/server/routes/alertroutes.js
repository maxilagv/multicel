/**
 * alertroutes.js
 *
 * Rutas REST para configuración y prueba de alertas WhatsApp.
 * Todas requieren autenticación y rol admin/gerente.
 *
 *   GET  /api/alerts/config          — obtener configuración actual
 *   PUT  /api/alerts/config          — guardar configuración (parcial o total)
 *   POST /api/alerts/test            — enviar mensaje de prueba al dueño
 */

'use strict';

const express       = require('express');
const router        = express.Router();
const auth          = require('../middlewares/authmiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const alertConfigRepo = require('../db/repositories/alertConfigRepository');
const { sendOwnerAlert } = require('../services/alertService');

const adminOrGerente = [auth, requireRole(['admin', 'gerente'])];

// ─── GET /api/alerts/config ───────────────────────────────────────────────────

router.get('/alerts/config', ...adminOrGerente, async (req, res) => {
  try {
    const config = await alertConfigRepo.getAlertConfig();
    res.json(config);
  } catch (err) {
    console.error('[AlertRoutes] GET /alerts/config:', err?.message);
    res.status(500).json({ error: 'Error al leer la configuración de alertas.' });
  }
});

// ─── PUT /api/alerts/config ───────────────────────────────────────────────────

router.put('/alerts/config', ...adminOrGerente, async (req, res) => {
  try {
    const body     = req.body || {};
    const usuarioId = req.user?.id || req.user?.userId || null;

    // Validaciones básicas de teléfono si viene incluido
    if (body.ownerPhone !== undefined) {
      const phone = String(body.ownerPhone || '').trim();
      if (phone && !/^\+\d{7,15}$/.test(phone)) {
        return res.status(400).json({
          error: 'El teléfono debe estar en formato E.164 (ej: +5491112345678).',
        });
      }
    }

    // Validar hora del resumen diario
    if (body.daily?.hour !== undefined) {
      const h = Number(body.daily.hour);
      if (!Number.isInteger(h) || h < 0 || h > 23) {
        return res.status(400).json({ error: 'La hora del resumen debe ser un entero entre 0 y 23.' });
      }
    }

    await alertConfigRepo.saveAlertConfig(body, usuarioId);
    const updated = await alertConfigRepo.getAlertConfig();
    res.json(updated);
  } catch (err) {
    console.error('[AlertRoutes] PUT /alerts/config:', err?.message);
    res.status(500).json({ error: 'Error al guardar la configuración de alertas.' });
  }
});

// ─── POST /api/alerts/test ────────────────────────────────────────────────────

router.post('/alerts/test', ...adminOrGerente, async (req, res) => {
  try {
    const result = await sendOwnerAlert(
      '✅ *Prueba de alertas Kaisen*\n\nSi ves este mensaje, las alertas WhatsApp están funcionando correctamente.'
    );

    if (result?.ok) {
      return res.json({ ok: true, message: 'Mensaje de prueba enviado correctamente.' });
    }

    if (result?.skipped) {
      const reasons = {
        alerts_disabled:  'Las alertas están deshabilitadas. Activálas primero.',
        no_phone:         'No hay teléfono del dueño configurado.',
        rate_limited:     'Límite de mensajes por hora alcanzado. Intentá más tarde.',
        provider_offline: 'WhatsApp no está conectado. Escaneá el QR en Configuración.',
      };
      return res.status(400).json({
        ok: false,
        error: reasons[result.skipped] || `No se pudo enviar (${result.skipped}).`,
      });
    }

    return res.status(502).json({
      ok: false,
      error: result?.errorMessage || 'El proveedor WhatsApp rechazó el mensaje.',
    });
  } catch (err) {
    console.error('[AlertRoutes] POST /alerts/test:', err?.message);
    res.status(500).json({ ok: false, error: 'Error inesperado al enviar la prueba.' });
  }
});

module.exports = router;
