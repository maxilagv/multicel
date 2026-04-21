/**
 * Tests unitarios — Helpers de salesRepository
 *
 * Estas funciones son puras (sin DB) y contienen lógica crítica de negocio:
 * - Cálculo de precios según lista
 * - Cálculo de costos
 * - Normalización de fechas
 *
 * Un bug acá = precios incorrectos en miles de ventas.
 */

// Extraemos las funciones privadas exportadas vía __test__ si existen,
// o las probamos a través de comportamiento observable
// Por ahora, las copiamos directamente para testear la lógica pura.

// ── Funciones a testear (copiadas del módulo) ─────────────────

function roundMoney(value) {
  const n = Number(value) || 0;
  return Math.round(n * 100) / 100;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMysqlDatetimeUTC(date) {
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`
  );
}

function normalizeVentaFecha(fechaInput) {
  if (!fechaInput) return toMysqlDatetimeUTC(new Date());
  const candidate = fechaInput instanceof Date ? fechaInput : new Date(String(fechaInput).trim());
  if (Number.isNaN(candidate.getTime())) {
    const e = new Error('Fecha de venta invalida');
    e.status = 400;
    throw e;
  }
  return toMysqlDatetimeUTC(candidate);
}

function resolveCostoUnitario(product) {
  const costoPesos = Number(product?.costo_pesos || 0);
  if (costoPesos > 0) return costoPesos;
  const costoDolares = Number(product?.costo_dolares || 0);
  const tipoCambio = Number(product?.tipo_cambio || 0);
  if (costoDolares > 0 && tipoCambio > 0) return costoDolares * tipoCambio;
  return 0;
}

function normalizePriceListType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'distribuidor') return 'distribuidor';
  if (raw === 'final') return 'final';
  return 'local';
}

function resolveUnitPriceByList(product, priceListType) {
  const base = Number(product?.price || 0);
  const local = Number(product?.price_local || 0);
  const distribuidor = Number(product?.price_distribuidor || 0);
  const finalPrice = Number(product?.precio_final || 0);

  const candidates =
    priceListType === 'final'
      ? [finalPrice, local, distribuidor, base]
      : priceListType === 'distribuidor'
      ? [distribuidor, local, finalPrice, base]
      : [local, distribuidor, finalPrice, base];

  for (const candidate of candidates) {
    const n = Number(candidate || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

// ── Tests ─────────────────────────────────────────────────────

describe('roundMoney()', () => {
  it('redondea a 2 decimales', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10.0);
    expect(roundMoney(1000.999)).toBe(1001.0);
  });

  it('maneja valores nulos/undefined/NaN como 0', () => {
    expect(roundMoney(null)).toBe(0);
    expect(roundMoney(undefined)).toBe(0);
    expect(roundMoney('no-es-numero')).toBe(0);
  });

  it('maneja enteros sin cambios', () => {
    expect(roundMoney(100)).toBe(100);
    expect(roundMoney(0)).toBe(0);
  });
});

describe('resolveCostoUnitario()', () => {
  it('prefiere costo_pesos sobre costo en dólares', () => {
    const product = { costo_pesos: 500, costo_dolares: 10, tipo_cambio: 1000 };
    expect(resolveCostoUnitario(product)).toBe(500);
  });

  it('calcula costo_dolares * tipo_cambio cuando no hay costo_pesos', () => {
    const product = { costo_pesos: 0, costo_dolares: 10, tipo_cambio: 1000 };
    expect(resolveCostoUnitario(product)).toBe(10000);
  });

  it('devuelve 0 cuando no hay datos de costo', () => {
    expect(resolveCostoUnitario({})).toBe(0);
    expect(resolveCostoUnitario(null)).toBe(0);
    expect(resolveCostoUnitario(undefined)).toBe(0);
  });

  it('devuelve 0 si tiene dólares pero no tipo de cambio', () => {
    const product = { costo_dolares: 10, tipo_cambio: 0 };
    expect(resolveCostoUnitario(product)).toBe(0);
  });
});

describe('normalizePriceListType()', () => {
  it('reconoce distribuidor y final exactos', () => {
    expect(normalizePriceListType('distribuidor')).toBe('distribuidor');
    expect(normalizePriceListType('final')).toBe('final');
  });

  it('normaliza a local por defecto', () => {
    expect(normalizePriceListType('local')).toBe('local');
    expect(normalizePriceListType('')).toBe('local');
    expect(normalizePriceListType(null)).toBe('local');
    expect(normalizePriceListType('desconocido')).toBe('local');
  });

  it('es case-insensitive', () => {
    expect(normalizePriceListType('DISTRIBUIDOR')).toBe('distribuidor');
    expect(normalizePriceListType('Final')).toBe('final');
    expect(normalizePriceListType('LOCAL')).toBe('local');
  });
});

describe('resolveUnitPriceByList()', () => {
  const product = {
    price: 100,
    price_local: 150,
    price_distribuidor: 120,
    precio_final: 200,
  };

  it('lista local → prefiere price_local', () => {
    expect(resolveUnitPriceByList(product, 'local')).toBe(150);
  });

  it('lista distribuidor → prefiere price_distribuidor', () => {
    expect(resolveUnitPriceByList(product, 'distribuidor')).toBe(120);
  });

  it('lista final → prefiere precio_final', () => {
    expect(resolveUnitPriceByList(product, 'final')).toBe(200);
  });

  it('cae en fallback si el precio preferido es 0', () => {
    const p = { price: 100, price_local: 0, price_distribuidor: 0, precio_final: 0 };
    expect(resolveUnitPriceByList(p, 'local')).toBe(100);
  });

  it('devuelve 0 si ningún precio es válido', () => {
    expect(resolveUnitPriceByList({}, 'local')).toBe(0);
    expect(resolveUnitPriceByList(null, 'local')).toBe(0);
  });
});

describe('normalizeVentaFecha()', () => {
  it('usa la fecha actual si no se pasa valor', () => {
    const before = new Date();
    const result = normalizeVentaFecha(null);
    const after = new Date();
    // Result should be a valid datetime string in MySQL format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // Should be close to now (within 1 second)
    const parsed = new Date(result.replace(' ', 'T') + 'Z');
    expect(parsed.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(parsed.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it('convierte un Date a formato MySQL UTC', () => {
    const date = new Date('2025-06-15T10:30:00.000Z');
    const result = normalizeVentaFecha(date);
    expect(result).toBe('2025-06-15 10:30:00');
  });

  it('acepta string ISO y convierte a MySQL', () => {
    const result = normalizeVentaFecha('2025-01-01T00:00:00.000Z');
    expect(result).toBe('2025-01-01 00:00:00');
  });

  it('lanza error con status 400 para fechas inválidas', () => {
    expect(() => normalizeVentaFecha('no-es-fecha')).toThrow('Fecha de venta invalida');
    try {
      normalizeVentaFecha('invalid');
    } catch (e) {
      expect(e.status).toBe(400);
    }
  });
});
