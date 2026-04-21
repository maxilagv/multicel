/**
 * Utilidades de redondeo de precios.
 * El step define la unidad de redondeo (1, 5, 10, 50, 100, 500, 1000).
 * step=1 → precio entero sin decimales ($47.3 → $47)
 * step=10 → múltiplo de 10 más cercano ($47 → $50)
 * step=100 → múltiplo de 100 más cercano ($347 → $300)
 */

const VALID_STEPS = [1, 5, 10, 50, 100, 500, 1000];
const DEFAULT_STEP = 1;

/**
 * Redondea un valor de precio al step configurado.
 * @param {number} value
 * @param {number} step
 * @returns {number}
 */
function roundPrice(value, step = DEFAULT_STEP) {
  const s = VALID_STEPS.includes(Number(step)) ? Number(step) : DEFAULT_STEP;
  return Math.round(Number(value) / s) * s;
}

/**
 * Normaliza un step recibido del exterior.
 * Si el valor no es uno de los válidos, devuelve DEFAULT_STEP.
 * @param {any} raw
 * @returns {number}
 */
function normalizeStep(raw) {
  const n = Number(raw);
  return VALID_STEPS.includes(n) ? n : DEFAULT_STEP;
}

module.exports = { roundPrice, normalizeStep, VALID_STEPS, DEFAULT_STEP };
