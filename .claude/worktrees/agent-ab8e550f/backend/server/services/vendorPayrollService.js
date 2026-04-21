function normalizePeriodo(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['dia', 'día', 'diario'].includes(raw)) return 'dia';
  if (['semana', 'semanal'].includes(raw)) return 'semana';
  if (['mes', 'mensual'].includes(raw)) return 'mes';
  return 'mes';
}

function toLocalDateString(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getTime());
  const str = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function resolveRange({ periodo, desde, hasta, baseDate } = {}) {
  const period = normalizePeriodo(periodo || 'mes');
  let fromDate = parseDateInput(desde);
  let toDate = parseDateInput(hasta);
  const base = parseDateInput(baseDate) || new Date();

  if (fromDate && !toDate) toDate = new Date(fromDate.getTime());
  if (!fromDate && toDate) fromDate = new Date(toDate.getTime());

  if (!fromDate || !toDate) {
    if (period === 'dia') {
      const d = fromDate || toDate || base;
      fromDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      toDate = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    } else if (period === 'semana') {
      const d = fromDate || toDate || base;
      const dow = d.getDay(); // 0 = domingo
      const daysSinceMonday = (dow + 6) % 7;
      fromDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday);
      toDate = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 5);
    } else {
      const d = fromDate || toDate || base;
      fromDate = new Date(d.getFullYear(), d.getMonth(), 1);
      toDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }
  }

  if (fromDate && toDate && fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  return {
    periodo: period,
    fromDate,
    toDate,
    fromStr: toLocalDateString(fromDate),
    toStr: toLocalDateString(toDate),
  };
}

function roundMoney(value) {
  const n = Number(value) || 0;
  return Math.round(n * 100) / 100;
}

module.exports = {
  normalizePeriodo,
  toLocalDateString,
  parseDateInput,
  resolveRange,
  roundMoney,
};
