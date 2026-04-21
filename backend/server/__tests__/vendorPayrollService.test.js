const payroll = require('../services/vendorPayrollService');

describe('vendorPayrollService', () => {
  test('normalizePeriodo', () => {
    expect(payroll.normalizePeriodo('DIA')).toBe('dia');
    expect(payroll.normalizePeriodo('semanal')).toBe('semana');
    expect(payroll.normalizePeriodo('mensual')).toBe('mes');
    expect(payroll.normalizePeriodo('')).toBe('mes');
  });

  test('resolveRange dia', () => {
    const range = payroll.resolveRange({ periodo: 'dia', desde: '2026-02-03' });
    expect(range.fromStr).toBe('2026-02-03');
    expect(range.toStr).toBe('2026-02-03');
  });

  test('resolveRange semana (lunes a sabado)', () => {
    const base = new Date(2026, 1, 3); // 2026-02-03 (martes)
    const range = payroll.resolveRange({ periodo: 'semana', baseDate: base });
    expect(range.fromStr).toBe('2026-02-02');
    expect(range.toStr).toBe('2026-02-07');
  });

  test('resolveRange mes', () => {
    const base = new Date(2026, 1, 3); // febrero 2026
    const range = payroll.resolveRange({ periodo: 'mes', baseDate: base });
    expect(range.fromStr).toBe('2026-02-01');
    expect(range.toStr).toBe('2026-02-28');
  });
});
