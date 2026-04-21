/**
 * Tests de funciones puras de arcaService (lógica fiscal)
 *
 * IMPORTANTE: estas funciones determinan si una factura electrónica
 * sale bien o mal. Un bug acá = factura rechazada por AFIP o multa fiscal.
 *
 * Estrategia: copiar las funciones puras (sin DB ni red) y testearlas
 * exhaustivamente. Todas son deterministas — misma entrada, misma salida.
 */

// ── Funciones extraídas de arcaService.js ────────────────────
function round2(value) {
  const num = Number(value) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function onlyDigits(value) {
  if (value == null) return '';
  return String(value).replace(/\D/g, '');
}

function normalizeCuit(value) {
  if (!value) return null;
  const digits = onlyDigits(value);
  return digits.length >= 8 ? digits : null;
}

function normalizeCondicionIva(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('responsable')) return 'responsable_inscripto';
  if (raw.includes('mono')) return 'monotributo';
  if (raw.includes('exento')) return 'exento';
  if (raw.includes('consumidor')) return 'consumidor_final';
  if (raw.includes('no categorizado')) return 'no_categorizado';
  return raw;
}

function resolveComprobanteTipo({ emisorCondicion, receptorCondicion }) {
  const emisor = normalizeCondicionIva(emisorCondicion);
  const receptor = normalizeCondicionIva(receptorCondicion);
  if (emisor === 'monotributo' || emisor === 'exento') return 'C';
  if (emisor === 'responsable_inscripto' && receptor === 'responsable_inscripto') return 'A';
  return 'B';
}

function comprobanteTipoToCodigo(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t === 'A') return 1;
  if (t === 'B') return 6;
  return 11; // C
}

function resolveDocTipo(cliente) {
  const tipoDoc = String(cliente.tipo_doc || '').toUpperCase().trim();
  const map = { CUIT: 80, CUIL: 86, CDI: 87, DNI: 96, PASAPORTE: 94, CONSUMIDOR_FINAL: 99 };
  const numeroRaw = onlyDigits(cliente.nro_doc || cliente.cuit_cuil || '');
  if (tipoDoc && map[tipoDoc]) return { tipo: map[tipoDoc], numero: numeroRaw || '0' };
  if (numeroRaw) return { tipo: 80, numero: numeroRaw };
  return { tipo: 99, numero: '0' };
}

function mapAlicuotaToId(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  const key = round2(r);
  if (key === 2.5) return 9;
  if (key === 5) return 8;
  if (key === 10.5) return 4;
  if (key === 21) return 5;
  if (key === 27) return 6;
  return null;
}

function formatDateYYYYMMDD(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function normalizeAlicuotasIva(value) {
  let input = value;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); }
    catch { input = String(input).split(',').map((i) => i.trim()).filter(Boolean); }
  }
  const normalized = Array.from(
    new Set((Array.isArray(input) ? input : [0, 10.5, 21, 27])
      .map((item) => round2(Number(item)))
      .filter((item) => Number.isFinite(item) && item >= 0))
  ).sort((a, b) => a - b);
  return normalized.length ? normalized : [0, 10.5, 21, 27];
}

function calcFiscalFromItems({ items, descuentoTotal, preciosIncluyenIva }) {
  const cleanItems = (items || []).map((it) => {
    const qty = Number(it.cantidad || 0);
    const subtotal = Number(it.subtotal != null ? it.subtotal : qty * Number(it.precio_unitario || 0)) || 0;
    const ivaRate = Number(it.iva_alicuota != null ? it.iva_alicuota : 21);
    return {
      producto_id: it.producto_id,
      descripcion: it.producto_nombre || it.descripcion || '',
      cantidad: qty,
      precio_unitario: Number(it.precio_unitario || 0),
      subtotal,
      iva_alicuota: ivaRate,
    };
  }).filter((it) => it.cantidad > 0 && it.subtotal >= 0);

  if (!cleanItems.length) throw new Error('La venta no tiene items para facturar');

  const lines = cleanItems.map((it) => {
    const rate = Number(it.iva_alicuota) || 0;
    let base = 0, iva = 0, gross = 0;
    if (preciosIncluyenIva) {
      gross = Number(it.subtotal) || 0;
      if (rate > 0) { base = gross / (1 + rate / 100); iva = gross - base; }
      else { base = gross; iva = 0; }
    } else {
      base = Number(it.subtotal) || 0;
      iva = rate > 0 ? base * (rate / 100) : 0;
      gross = base + iva;
    }
    return { ...it, gross: round2(gross), base: round2(base), iva: round2(iva) };
  });

  const totalGross = round2(lines.reduce((acc, it) => acc + (Number(it.gross) || 0), 0));
  const totalBase = round2(lines.reduce((acc, it) => acc + (Number(it.base) || 0), 0));
  const discount = Math.max(0, round2(descuentoTotal || 0));
  if ((preciosIncluyenIva ? totalGross : totalBase) <= 0) throw new Error('El total de la venta es invalido');

  const maxDiscount = Math.min(discount, preciosIncluyenIva ? totalGross : totalBase);
  const totalRef = preciosIncluyenIva ? totalGross : totalBase;
  let remainingDiscount = maxDiscount;
  const discounted = lines.map((line, idx) => {
    const isLast = idx === lines.length - 1;
    const refValue = preciosIncluyenIva ? line.gross : line.base;
    const share = totalRef > 0 ? refValue / totalRef : 0;
    const lineDiscount = isLast ? remainingDiscount : round2(maxDiscount * share);
    remainingDiscount = round2(remainingDiscount - lineDiscount);
    const ratio = refValue > 0 ? Math.max(0, (refValue - lineDiscount) / refValue) : 0;
    return { ...line, descuento: lineDiscount, base: round2(line.base * ratio), iva: round2(line.iva * ratio), gross: round2((line.base + line.iva) * ratio) };
  });

  const ivaMap = new Map();
  let impNeto = 0, impIva = 0, impOpEx = 0;
  for (const line of discounted) {
    const rate = Number(line.iva_alicuota) || 0;
    if (rate > 0) {
      impNeto += line.base; impIva += line.iva;
      const id = mapAlicuotaToId(rate);
      if (!id) throw new Error(`Alicuota IVA no soportada (${rate}%)`);
      const entry = ivaMap.get(id) || { id, base: 0, importe: 0, rate };
      entry.base = round2(entry.base + line.base);
      entry.importe = round2(entry.importe + line.iva);
      ivaMap.set(id, entry);
    } else { impOpEx += line.base; }
  }

  return {
    items: discounted,
    ivaItems: Array.from(ivaMap.values()),
    totales: { impNeto: round2(impNeto), impIva: round2(impIva), impOpEx: round2(impOpEx), impTotConc: 0 },
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('normalizeCuit()', () => {
  it('extrae dígitos de CUIT formateado', () => {
    expect(normalizeCuit('20-12345678-9')).toBe('20123456789');
  });
  it('acepta CUIT sin guiones', () => {
    expect(normalizeCuit('20123456789')).toBe('20123456789');
  });
  it('devuelve null si hay menos de 8 dígitos', () => {
    expect(normalizeCuit('123')).toBeNull();
    expect(normalizeCuit('')).toBeNull();
    expect(normalizeCuit(null)).toBeNull();
  });
});

describe('normalizeCondicionIva()', () => {
  it('detecta responsable inscripto', () => {
    expect(normalizeCondicionIva('Responsable Inscripto')).toBe('responsable_inscripto');
    expect(normalizeCondicionIva('RESPONSABLE_INSCRIPTO')).toBe('responsable_inscripto');
  });
  it('detecta monotributo', () => {
    expect(normalizeCondicionIva('Monotributo')).toBe('monotributo');
    expect(normalizeCondicionIva('MONO')).toBe('monotributo');
  });
  it('detecta consumidor final', () => {
    expect(normalizeCondicionIva('Consumidor Final')).toBe('consumidor_final');
  });
  it('detecta exento', () => {
    expect(normalizeCondicionIva('Exento')).toBe('exento');
  });
  it('devuelve string vacío para null/undefined', () => {
    expect(normalizeCondicionIva(null)).toBe('');
    expect(normalizeCondicionIva('')).toBe('');
  });
});

describe('resolveComprobanteTipo() — regla fiscal AFIP', () => {
  it('A: Responsable Inscripto → Responsable Inscripto', () => {
    expect(resolveComprobanteTipo({
      emisorCondicion: 'responsable_inscripto',
      receptorCondicion: 'responsable_inscripto',
    })).toBe('A');
  });

  it('B: Responsable Inscripto → Consumidor Final', () => {
    expect(resolveComprobanteTipo({
      emisorCondicion: 'Responsable Inscripto',
      receptorCondicion: 'consumidor_final',
    })).toBe('B');
  });

  it('B: Responsable Inscripto → Monotributo', () => {
    expect(resolveComprobanteTipo({
      emisorCondicion: 'responsable_inscripto',
      receptorCondicion: 'monotributo',
    })).toBe('B');
  });

  it('C: Monotributo (siempre emite C)', () => {
    expect(resolveComprobanteTipo({
      emisorCondicion: 'monotributo',
      receptorCondicion: 'responsable_inscripto',
    })).toBe('C');
  });

  it('C: Exento (siempre emite C)', () => {
    expect(resolveComprobanteTipo({
      emisorCondicion: 'exento',
      receptorCondicion: 'consumidor_final',
    })).toBe('C');
  });
});

describe('comprobanteTipoToCodigo() — código AFIP', () => {
  it('A → código 1', () => expect(comprobanteTipoToCodigo('A')).toBe(1));
  it('B → código 6', () => expect(comprobanteTipoToCodigo('B')).toBe(6));
  it('C → código 11', () => expect(comprobanteTipoToCodigo('C')).toBe(11));
  it('es case-insensitive', () => {
    expect(comprobanteTipoToCodigo('a')).toBe(1);
    expect(comprobanteTipoToCodigo('b')).toBe(6);
  });
});

describe('resolveDocTipo()', () => {
  it('CUIT → código 80', () => {
    const r = resolveDocTipo({ tipo_doc: 'CUIT', nro_doc: '20123456789' });
    expect(r.tipo).toBe(80);
    expect(r.numero).toBe('20123456789');
  });
  it('DNI → código 96', () => {
    expect(resolveDocTipo({ tipo_doc: 'DNI', nro_doc: '30123456' }).tipo).toBe(96);
  });
  it('CONSUMIDOR_FINAL → código 99', () => {
    expect(resolveDocTipo({ tipo_doc: 'CONSUMIDOR_FINAL' }).tipo).toBe(99);
  });
  it('sin tipo → consumidor final 99', () => {
    expect(resolveDocTipo({}).tipo).toBe(99);
  });
  it('infiere CUIT si hay cuit_cuil sin tipo_doc', () => {
    const r = resolveDocTipo({ cuit_cuil: '20-12345678-9' });
    expect(r.tipo).toBe(80); // tiene número → infiere CUIT
  });
});

describe('mapAlicuotaToId() — códigos IVA AFIP', () => {
  it('10.5% → id 4', () => expect(mapAlicuotaToId(10.5)).toBe(4));
  it('21% → id 5', () => expect(mapAlicuotaToId(21)).toBe(5));
  it('27% → id 6', () => expect(mapAlicuotaToId(27)).toBe(6));
  it('5% → id 8', () => expect(mapAlicuotaToId(5)).toBe(8));
  it('2.5% → id 9', () => expect(mapAlicuotaToId(2.5)).toBe(9));
  it('0% → null (exento)', () => expect(mapAlicuotaToId(0)).toBeNull());
  it('alícuota inválida → null', () => expect(mapAlicuotaToId(15)).toBeNull());
});

describe('calcFiscalFromItems() — cálculo fiscal IVA', () => {
  const itemBase = { producto_id: 1, cantidad: 1, precio_unitario: 1000, subtotal: 1000, iva_alicuota: 21 };

  it('precios con IVA incluido: desglosa base + IVA', () => {
    const { totales } = calcFiscalFromItems({
      items: [itemBase],
      descuentoTotal: 0,
      preciosIncluyenIva: true,
    });
    // 1000 con IVA 21% → base = 1000/1.21 = 826.45, IVA = 173.55
    expect(totales.impNeto).toBeCloseTo(826.45, 1);
    expect(totales.impIva).toBeCloseTo(173.55, 1);
    expect(round2(totales.impNeto + totales.impIva)).toBe(1000);
  });

  it('precios sin IVA: calcula IVA encima del neto', () => {
    const { totales } = calcFiscalFromItems({
      items: [itemBase],
      descuentoTotal: 0,
      preciosIncluyenIva: false,
    });
    // neto = 1000, IVA 21% = 210
    expect(totales.impNeto).toBe(1000);
    expect(totales.impIva).toBe(210);
  });

  it('descuento se distribuye proporcionalmente', () => {
    const items = [
      { producto_id: 1, cantidad: 1, subtotal: 1000, iva_alicuota: 21 },
      { producto_id: 2, cantidad: 1, subtotal: 1000, iva_alicuota: 21 },
    ];
    const { totales } = calcFiscalFromItems({ items, descuentoTotal: 200, preciosIncluyenIva: true });
    // Total gross = 2000, descuento = 200, queda ~1800 (±0.02 por redondeo)
    const totalFinal = totales.impNeto + totales.impIva;
    expect(totalFinal).toBeCloseTo(1800, 1);
    // El total debe ser menor al original
    expect(totalFinal).toBeLessThan(2000);
    expect(totalFinal).toBeGreaterThan(1799);
  });

  it('ítems con IVA 0% van a impOpEx', () => {
    const { totales } = calcFiscalFromItems({
      items: [{ producto_id: 1, cantidad: 1, subtotal: 500, iva_alicuota: 0 }],
      descuentoTotal: 0,
      preciosIncluyenIva: false,
    });
    expect(totales.impOpEx).toBe(500);
    expect(totales.impIva).toBe(0);
  });

  it('lanza error si no hay ítems válidos', () => {
    expect(() => calcFiscalFromItems({ items: [], descuentoTotal: 0, preciosIncluyenIva: true }))
      .toThrow('items para facturar');
  });

  it('lanza error para alícuota IVA no soportada (15%)', () => {
    expect(() => calcFiscalFromItems({
      items: [{ producto_id: 1, cantidad: 1, subtotal: 1000, iva_alicuota: 15 }],
      descuentoTotal: 0,
      preciosIncluyenIva: false,
    })).toThrow('Alicuota IVA no soportada');
  });

  it('genera ivaItems con id y base/importe correctos', () => {
    const { ivaItems } = calcFiscalFromItems({
      items: [itemBase],
      descuentoTotal: 0,
      preciosIncluyenIva: false,
    });
    expect(ivaItems).toHaveLength(1);
    expect(ivaItems[0].id).toBe(5); // 21% = id 5
    expect(ivaItems[0].base).toBe(1000);
    expect(ivaItems[0].importe).toBe(210);
  });
});

describe('normalizeAlicuotasIva()', () => {
  it('acepta array de números', () => {
    expect(normalizeAlicuotasIva([0, 10.5, 21])).toEqual([0, 10.5, 21]);
  });
  it('acepta string JSON', () => {
    expect(normalizeAlicuotasIva('[0, 21, 10.5]')).toEqual([0, 10.5, 21]);
  });
  it('acepta string CSV', () => {
    expect(normalizeAlicuotasIva('0, 10.5, 21')).toEqual([0, 10.5, 21]);
  });
  it('devuelve default si el input es inválido', () => {
    expect(normalizeAlicuotasIva(null)).toEqual([0, 10.5, 21, 27]);
    expect(normalizeAlicuotasIva(undefined)).toEqual([0, 10.5, 21, 27]);
  });
  it('elimina duplicados y ordena', () => {
    expect(normalizeAlicuotasIva([21, 21, 10.5, 0])).toEqual([0, 10.5, 21]);
  });
});

describe('formatDateYYYYMMDD()', () => {
  it('formatea en YYYYMMDD para AFIP', () => {
    const date = new Date('2025-06-15T12:00:00Z');
    const result = formatDateYYYYMMDD(date);
    expect(result).toMatch(/^\d{8}$/); // 8 dígitos
    expect(result).toContain('2025');
  });
});
