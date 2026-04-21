const repo = require('../db/repositories/marketplaceRepository');

function parseTimestamp(value) {
  if (!value) return null;
  const text = String(value).trim();
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isWithinRange(now, desde, hasta) {
  const start = parseTimestamp(desde);
  const end = parseTimestamp(hasta);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function resolveBeneficio(total, referido, alianza) {
  const totalVal = Math.max(0, Number(total || 0));
  const tipo = referido.referido_beneficio_tipo || alianza.alianza_beneficio_tipo || 'porcentaje';
  const valorRaw =
    referido.referido_beneficio_valor != null
      ? Number(referido.referido_beneficio_valor)
      : Number(alianza.alianza_beneficio_valor || 0);
  let descuento = 0;
  if (tipo === 'monto') {
    descuento = Math.min(totalVal, valorRaw || 0);
  } else {
    descuento = totalVal * ((valorRaw || 0) / 100);
  }
  return {
    beneficio_tipo: tipo,
    beneficio_valor: valorRaw || 0,
    descuento_aplicado: roundMoney(descuento),
  };
}

function resolveComision(totalBase, alianza) {
  const base = Math.max(0, Number(totalBase || 0));
  const tipo = alianza.comision_tipo || 'porcentaje';
  const valorRaw = Number(alianza.comision_valor || 0);
  let comision = 0;
  if (tipo === 'monto') {
    comision = Math.min(base, valorRaw || 0);
  } else {
    comision = base * ((valorRaw || 0) / 100);
  }
  return {
    comision_tipo: tipo,
    comision_valor: valorRaw || 0,
    comision_monto: roundMoney(comision),
  };
}

async function resolveReferido({ codigo, total, client } = {}) {
  const normalized = repo.normalizeCodigo(codigo);
  if (!normalized) {
    const e = new Error('Codigo de referido requerido');
    e.status = 400;
    throw e;
  }
  const referido = await repo.getReferidoByCodigo(normalized, client);
  if (!referido) {
    const e = new Error('Referido no encontrado');
    e.status = 404;
    throw e;
  }
  if (String(referido.estado) !== 'activo') {
    const e = new Error('Referido inactivo o agotado');
    e.status = 409;
    throw e;
  }
  if (Number(referido.pyme_activo || 0) === 0) {
    const e = new Error('Pyme aliada inactiva');
    e.status = 409;
    throw e;
  }
  if (Number(referido.alianza_activo || 0) === 0 || String(referido.alianza_estado) !== 'activa') {
    const e = new Error('Alianza no disponible');
    e.status = 409;
    throw e;
  }

  const now = new Date();
  if (!isWithinRange(now, referido.vigencia_desde, referido.vigencia_hasta)) {
    const e = new Error('Referido fuera de vigencia');
    e.status = 409;
    throw e;
  }
  if (!isWithinRange(now, referido.alianza_vigencia_desde, referido.alianza_vigencia_hasta)) {
    const e = new Error('Alianza fuera de vigencia');
    e.status = 409;
    throw e;
  }

  const maxUsos = Number(referido.max_usos || 0);
  const usosActuales = Number(referido.usos_actuales || 0);
  if (maxUsos > 0 && usosActuales >= maxUsos) {
    const e = new Error('Referido agotado');
    e.status = 409;
    throw e;
  }

  const limiteAlianza = Number(referido.alianza_limite_usos || 0);
  if (limiteAlianza > 0) {
    const usosAlianza = await repo.countUsosByAlianza(referido.alianza_id, client);
    if (usosAlianza >= limiteAlianza) {
      const e = new Error('Alianza sin cupo disponible');
      e.status = 409;
      throw e;
    }
  }

  const beneficios = resolveBeneficio(total, referido, referido);
  const baseComision = Math.max(0, Number(total || 0) - beneficios.descuento_aplicado);
  const comision = resolveComision(baseComision, referido);

  return {
    codigo: normalized,
    referido_id: Number(referido.referido_id),
    alianza_id: Number(referido.alianza_id),
    alianza_nombre: referido.alianza_nombre || null,
    pyme_id: Number(referido.pyme_id),
    pyme_nombre: referido.pyme_nombre || null,
    usos_actuales: usosActuales,
    max_usos: maxUsos,
    beneficio_tipo: beneficios.beneficio_tipo,
    beneficio_valor: beneficios.beneficio_valor,
    descuento_aplicado: beneficios.descuento_aplicado,
    comision_tipo: comision.comision_tipo,
    comision_valor: comision.comision_valor,
    comision_monto: comision.comision_monto,
  };
}

module.exports = {
  resolveReferido,
};
