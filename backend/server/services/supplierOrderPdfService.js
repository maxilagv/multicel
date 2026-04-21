'use strict';

const PDFDocument = require('pdfkit');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const path = require('path');

// ─── Paleta de colores ────────────────────────────────────────────────────────
const COLOR = {
  bg:           '#F1F5F9',  // fondo general de página
  headerBg:     '#0F172A',  // fondo header superior oscuro
  headerText:   '#F8FAFC',  // texto en header oscuro
  headerSub:    '#94A3B8',  // subtítulo en header
  accent:       '#0EA5E9',  // azul cielo (acento principal)
  accentLight:  '#E0F2FE',  // fondo sección título tabla
  accentText:   '#0369A1',  // texto en sección título tabla
  tableHead:    '#1E293B',  // fondo encabezado de tabla
  tableHeadTxt: '#E2E8F0',  // texto encabezado tabla
  rowEven:      '#FFFFFF',  // fila par
  rowOdd:       '#F8FAFC',  // fila impar
  rowBorder:    '#E2E8F0',  // borde de filas
  stockNulo:    '#FFF1F2',  // fondo fila sin stock
  stockNuloBrd: '#FECDD3',  // borde fila sin stock
  stockBajo:    '#FFFBEB',  // fondo fila stock bajo
  stockBajoBrd: '#FDE68A',  // borde fila stock bajo
  textPrimary:  '#0F172A',  // texto principal
  textSecond:   '#475569',  // texto secundario
  textMuted:    '#94A3B8',  // texto apagado
  red:          '#EF4444',  // rojo (stock nulo badge)
  amber:        '#F59E0B',  // ámbar (stock bajo badge)
  green:        '#10B981',  // verde
  footerBg:     '#0F172A',  // fondo footer
  footerText:   '#94A3B8',  // texto footer
  white:        '#FFFFFF',
};

// ─── Dimensiones fijas ────────────────────────────────────────────────────────
const MARGIN       = 36;
const PAGE_W       = 595.28;  // A4 ancho en puntos
const USABLE_W     = PAGE_W - MARGIN * 2;   // 523.28 pt
const ROW_H        = 26;                    // altura de cada fila de datos
const HEADER_ROW_H = 22;                    // altura del encabezado de columnas

// Anchos de cada columna (suma = USABLE_W)
const COL = {
  num:       22,
  codigo:    66,
  producto: 166,
  categoria: 108,
  stockAct:  60,
  stockMin:  55,
  cantSol:   46,
};

// ─── Helpers de imagen remota ─────────────────────────────────────────────────
function fetchImageBuffer(url, redirectCount = 0) {
  if (!url) return Promise.resolve(null);
  if (redirectCount > 3) return Promise.resolve(null);
  let parsed;
  try { parsed = new URL(url); } catch { return Promise.resolve(null); }
  const client = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = client.get(
      parsed,
      { timeout: 6000, headers: { 'User-Agent': 'SupplierOrderPDF/1.0' } },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          try {
            const nextUrl = new URL(res.headers.location, parsed).toString();
            fetchImageBuffer(nextUrl, redirectCount + 1).then(resolve);
          } catch { resolve(null); }
          return;
        }
        if (status !== 200) { res.resume(); resolve(null); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end',  () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
        res.on('error', () => resolve(null));
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error',   () => resolve(null));
  });
}

function resolveImageExtension(contentType, url) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png'))  return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpeg';
  try {
    const ext = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
    if (ext === 'png')  return 'png';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  } catch { /* noop */ }
  return null;
}

async function loadRemoteImage(url) {
  if (!url) return null;
  try {
    const img = await fetchImageBuffer(url);
    if (!img) return null;
    const ext = resolveImageExtension(img.contentType, url);
    if (!ext) return null;
    return { buffer: img.buffer, ext };
  } catch { return null; }
}

// ─── Helpers de texto ─────────────────────────────────────────────────────────
function safe(value, fallback = '-') {
  const t = String(value == null ? '' : value).trim();
  return t || fallback;
}

function formatDate(date) {
  const d = date instanceof Date ? date : new Date();
  return d.toLocaleDateString('es-AR', {
    day:   '2-digit',
    month: 'long',
    year:  'numeric',
  });
}

function formatDateShort(date) {
  const d = date instanceof Date ? date : new Date();
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Dibujo de celdas de tabla ────────────────────────────────────────────────
function drawCell(doc, text, x, y, w, h, opts = {}) {
  const {
    font      = 'Helvetica',
    fontSize  = 8.5,
    color     = COLOR.textPrimary,
    align     = 'left',
    bgColor   = null,
    padLeft   = 6,
    padTop    = null,
    ellipsis  = true,
  } = opts;

  if (bgColor) {
    doc.save().rect(x, y, w, h).fill(bgColor).restore();
  }

  const textY = padTop !== null ? y + padTop : y + (h - fontSize) / 2;
  doc
    .fillColor(color)
    .font(font)
    .fontSize(fontSize)
    .text(text, x + padLeft, textY, {
      width:    w - padLeft * 2,
      align,
      lineBreak: false,
      ellipsis,
    });
}

// ─── Portada ──────────────────────────────────────────────────────────────────
async function drawCoverPage(doc, { empresaNombre, empresaDireccion, logoUrl, fecha, totalProductos, filterLabel }) {
  const x = MARGIN;
  const y = MARGIN;
  const w = USABLE_W;
  const h = doc.page.height - MARGIN * 2;

  // Fondo oscuro
  doc.rect(x, y, w, h).fill(COLOR.headerBg);

  // Círculos decorativos
  doc.save().opacity(0.18).circle(x + w - 60, y + 60, 100).fill(COLOR.accent).restore();
  doc.save().opacity(0.12).circle(x + 50, y + h - 60, 85).fill(COLOR.accent).restore();
  doc.save().opacity(0.08).circle(x + w / 2, y + h / 2, 160).fill(COLOR.accent).restore();

  // Panel interior
  doc.roundedRect(x + 20, y + 20, w - 40, h - 40, 16).fill('#111827');

  // Logo
  const logoImg = await loadRemoteImage(logoUrl);
  const logoSize = 90;
  const logoX = x + w - 20 - logoSize - 28;
  const logoY = y + 52;
  if (logoImg) {
    doc.roundedRect(logoX, logoY, logoSize, logoSize, 12).fill(COLOR.white);
    doc.image(logoImg.buffer, logoX + 6, logoY + 6, {
      fit:     [logoSize - 12, logoSize - 12],
      align:   'center',
      valign:  'center',
    });
  }

  // Metadatos superiores
  doc
    .fillColor(COLOR.headerSub)
    .font('Helvetica')
    .fontSize(9)
    .text(formatDate(fecha), x + 44, y + 52);

  // Nombre empresa
  doc
    .fillColor(COLOR.headerText)
    .font('Helvetica-Bold')
    .fontSize(26)
    .text(safe(empresaNombre, 'Mi Empresa'), x + 44, y + 74, { width: w - 200 });

  // Dirección
  if (empresaDireccion) {
    doc
      .fillColor(COLOR.headerSub)
      .font('Helvetica')
      .fontSize(9)
      .text(empresaDireccion, x + 44, y + 108, { width: w - 200 });
  }

  // Título principal del documento
  const titleY = y + 148;
  doc
    .fillColor(COLOR.accent)
    .font('Helvetica-Bold')
    .fontSize(17)
    .text('Lista de Reposición', x + 44, titleY);
  doc
    .fillColor('#CBD5E1')
    .font('Helvetica')
    .fontSize(11)
    .text('Pedido a Proveedor', x + 44, titleY + 24);

  // Divisor
  doc
    .save()
    .moveTo(x + 44, titleY + 46)
    .lineTo(x + 44 + 180, titleY + 46)
    .strokeColor(COLOR.accent)
    .lineWidth(1.5)
    .stroke()
    .restore();

  // Descripción
  doc
    .fillColor('#94A3B8')
    .font('Helvetica')
    .fontSize(9.5)
    .text(
      'Este documento contiene los productos seleccionados para\nrenovar o reponer. Fue generado desde el sistema de gestión.',
      x + 44,
      titleY + 58,
      { width: w - 200 }
    );

  // Badges con estadísticas
  const badgeY = titleY + 108;
  const badges = [
    { label: 'Productos seleccionados', value: String(totalProductos) },
    { label: 'Filtro aplicado', value: filterLabel },
    { label: 'Fecha de emisión', value: formatDateShort(fecha) },
  ];
  let bx = x + 44;
  for (const badge of badges) {
    const bw = 148;
    doc.roundedRect(bx, badgeY, bw, 44, 8).fill('#1E293B');
    doc
      .fillColor(COLOR.accent)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(badge.value, bx + 8, badgeY + 7, { width: bw - 16, align: 'left', lineBreak: false });
    doc
      .fillColor('#64748B')
      .font('Helvetica')
      .fontSize(7.5)
      .text(badge.label.toUpperCase(), bx + 8, badgeY + 28, { width: bw - 16, lineBreak: false });
    bx += bw + 10;
  }

  // Nota legal al pie de portada
  doc
    .fillColor('#374151')
    .font('Helvetica')
    .fontSize(7.5)
    .text(
      'Documento de uso interno — Generado automáticamente. Los valores de stock reflejan el estado al momento de la generación.',
      x + 44,
      y + h - 56,
      { width: w - 88, align: 'center' }
    );

  doc.addPage();
}

// ─── Encabezado de sección (repetible en cada página) ─────────────────────────
function drawSectionHeader(doc, { empresaNombre, fecha, pageNum, totalPages }) {
  const x = MARGIN;
  const y = MARGIN;
  const w = USABLE_W;

  // Barra superior compacta
  doc.rect(x, y, w, 34).fill(COLOR.headerBg);
  doc
    .fillColor(COLOR.headerText)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(safe(empresaNombre, 'Mi Empresa'), x + 10, y + 7);
  doc
    .fillColor(COLOR.headerSub)
    .font('Helvetica')
    .fontSize(8)
    .text('Lista de Reposición / Pedido a Proveedor', x + 10, y + 20);
  doc
    .fillColor(COLOR.headerSub)
    .font('Helvetica')
    .fontSize(8)
    .text(`${formatDateShort(fecha)}  ·  Pág. ${pageNum} / ${totalPages}`, x + w - 10, y + 14, {
      align: 'right',
      width: 200,
    });

  return y + 34 + 8; // retorna el Y donde empieza el contenido
}

// ─── Encabezado de columnas de la tabla ───────────────────────────────────────
function drawTableHeader(doc, startY) {
  const x = MARGIN;
  const y = startY;
  const totalW = USABLE_W;

  doc.rect(x, y, totalW, HEADER_ROW_H).fill(COLOR.tableHead);

  let cx = x;

  const cols = [
    { key: 'num',      label: '#',                  w: COL.num,      align: 'center' },
    { key: 'codigo',   label: 'Código',              w: COL.codigo,   align: 'left'   },
    { key: 'producto', label: 'Producto',            w: COL.producto, align: 'left'   },
    { key: 'cat',      label: 'Categoría',           w: COL.categoria,align: 'left'   },
    { key: 'sa',       label: 'Stock\nActual',       w: COL.stockAct, align: 'center' },
    { key: 'sm',       label: 'Stock\nMínimo',       w: COL.stockMin, align: 'center' },
    { key: 'cs',       label: 'Cant.\nSolicitada',  w: COL.cantSol,  align: 'center' },
  ];

  for (const col of cols) {
    doc
      .fillColor(COLOR.tableHeadTxt)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(col.label, cx + 4, y + 4, {
        width:     col.w - 8,
        align:     col.align,
        lineBreak: true,
      });
    cx += col.w;
  }

  // Separador inferior del header
  doc
    .save()
    .moveTo(x, y + HEADER_ROW_H)
    .lineTo(x + totalW, y + HEADER_ROW_H)
    .strokeColor(COLOR.accent)
    .lineWidth(1.5)
    .stroke()
    .restore();

  return y + HEADER_ROW_H;
}

// ─── Fila de producto ─────────────────────────────────────────────────────────
function drawProductRow(doc, producto, rowIndex, y) {
  const x         = MARGIN;
  const stockAct  = Number(producto.stock_quantity ?? 0);
  const stockMin  = Number(producto.stock_minimo   ?? 0);
  const isNulo    = stockAct === 0;
  const isBajo    = !isNulo && stockAct <= stockMin && stockMin > 0;

  // Determinar colores de fondo
  let rowBg     = rowIndex % 2 === 0 ? COLOR.rowEven : COLOR.rowOdd;
  let rowBorder = COLOR.rowBorder;
  if (isNulo) { rowBg = COLOR.stockNulo; rowBorder = COLOR.stockNuloBrd; }
  else if (isBajo) { rowBg = COLOR.stockBajo; rowBorder = COLOR.stockBajoBrd; }

  // Fondo de fila
  doc.rect(x, y, USABLE_W, ROW_H).fill(rowBg);

  // Borde inferior
  doc
    .save()
    .moveTo(x, y + ROW_H)
    .lineTo(x + USABLE_W, y + ROW_H)
    .strokeColor(rowBorder)
    .lineWidth(0.5)
    .stroke()
    .restore();

  let cx = x;

  // # (número de fila)
  drawCell(doc, String(rowIndex + 1), cx, y, COL.num, ROW_H, {
    font:     'Helvetica',
    fontSize: 7.5,
    color:    COLOR.textMuted,
    align:    'center',
    padLeft:  0,
  });
  cx += COL.num;

  // Código
  drawCell(doc, safe(producto.codigo), cx, y, COL.codigo, ROW_H, {
    font:    'Helvetica',
    fontSize: 8,
    color:   COLOR.textSecond,
  });
  cx += COL.codigo;

  // Nombre del producto
  drawCell(doc, safe(producto.name), cx, y, COL.producto, ROW_H, {
    font:    'Helvetica-Bold',
    fontSize: 8.5,
    color:   COLOR.textPrimary,
  });
  cx += COL.producto;

  // Categoría
  drawCell(doc, safe(producto.category_name), cx, y, COL.categoria, ROW_H, {
    font:    'Helvetica',
    fontSize: 7.8,
    color:   COLOR.textSecond,
  });
  cx += COL.categoria;

  // Stock Actual — con badge de color
  const stockActStr = String(stockAct);
  const stockActColor = isNulo ? COLOR.red : isBajo ? COLOR.amber : COLOR.green;
  // Badge circular de fondo
  const badgeR = 9;
  const badgeCx = cx + COL.stockAct / 2;
  const badgeCy = y + ROW_H / 2;
  doc.save().circle(badgeCx, badgeCy, badgeR).fill(stockActColor + '22').restore();
  doc
    .fillColor(stockActColor)
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(stockActStr, cx, y + (ROW_H - 8.5) / 2, {
      width:     COL.stockAct,
      align:     'center',
      lineBreak: false,
    });
  cx += COL.stockAct;

  // Stock Mínimo
  drawCell(doc, String(stockMin), cx, y, COL.stockMin, ROW_H, {
    font:    'Helvetica',
    fontSize: 8,
    color:   COLOR.textSecond,
    align:   'center',
    padLeft: 0,
  });
  cx += COL.stockMin;

  // Cantidad Solicitada — celda de escritura (línea vacía para rellenar a mano)
  const cantSol = producto.cantidad_solicitada;
  if (cantSol != null && cantSol !== '') {
    drawCell(doc, String(cantSol), cx, y, COL.cantSol, ROW_H, {
      font:    'Helvetica-Bold',
      fontSize: 9,
      color:   COLOR.accent,
      align:   'center',
      padLeft: 0,
    });
  } else {
    // Línea vacía para escribir a mano
    const lineY = y + ROW_H - 7;
    const lineX1 = cx + 6;
    const lineX2 = cx + COL.cantSol - 6;
    doc
      .save()
      .moveTo(lineX1, lineY)
      .lineTo(lineX2, lineY)
      .strokeColor('#CBD5E1')
      .lineWidth(0.8)
      .stroke()
      .restore();
  }
}

// ─── Pie de página ────────────────────────────────────────────────────────────
function drawFooter(doc, { empresaNombre, pageNum, totalPages }) {
  const x  = MARGIN;
  const y  = doc.page.height - MARGIN - 18;
  const w  = USABLE_W;

  doc.rect(x, y, w, 18).fill(COLOR.footerBg);
  doc
    .fillColor(COLOR.footerText)
    .font('Helvetica')
    .fontSize(7)
    .text(
      `${safe(empresaNombre)} — Lista de Reposición / Pedido a Proveedor`,
      x + 8, y + 5,
      { width: w - 16, align: 'left', lineBreak: false }
    );
  doc
    .fillColor(COLOR.footerText)
    .font('Helvetica')
    .fontSize(7)
    .text(
      `Página ${pageNum} de ${totalPages}`,
      x + 8, y + 5,
      { width: w - 16, align: 'right', lineBreak: false }
    );
}

// ─── Leyenda de colores ───────────────────────────────────────────────────────
function drawColorLegend(doc, startY) {
  const x = MARGIN;
  const y = startY;

  doc.rect(x, y, USABLE_W, 18).fill('#F8FAFC');
  doc
    .save()
    .moveTo(x, y).lineTo(x + USABLE_W, y)
    .strokeColor(COLOR.rowBorder).lineWidth(0.5).stroke()
    .restore();

  const items = [
    { color: COLOR.stockNulo,  border: COLOR.stockNuloBrd, label: 'Sin stock (stock = 0)' },
    { color: COLOR.stockBajo,  border: COLOR.stockBajoBrd, label: 'Stock bajo (≤ stock mínimo)' },
    { color: COLOR.rowEven,    border: COLOR.rowBorder,    label: 'Stock normal' },
  ];

  let lx = x + 8;
  for (const item of items) {
    doc.roundedRect(lx, y + 4, 10, 10, 2).fillAndStroke(item.color, item.border);
    doc
      .fillColor(COLOR.textSecond)
      .font('Helvetica')
      .fontSize(7)
      .text(item.label, lx + 13, y + 5, { lineBreak: false });
    lx += 110;
  }

  return y + 18;
}

// ─── Función principal ────────────────────────────────────────────────────────
/**
 * @param {Object} opts
 * @param {{ nombre: string, direccion?: string, logoUrl?: string }} opts.empresa
 * @param {Array<{
 *   id: number,
 *   name: string,
 *   codigo?: string,
 *   category_name?: string,
 *   stock_quantity: number,
 *   stock_minimo?: number,
 *   cantidad_solicitada?: number
 * }>} opts.productos
 * @param {string} [opts.filterLabel]  — Descripción del filtro usado (ej: "Stock Nulo y Stock Bajo")
 * @param {Date}   [opts.fecha]
 * @returns {Promise<Buffer>}
 */
async function buildSupplierOrderPdf({ empresa = {}, productos = [], filterLabel = 'Stock Bajo / Sin Stock', fecha } = {}) {
  const generatedAt = fecha instanceof Date ? fecha : new Date();

  // Calcular total de páginas aproximado para el footer
  // (cover = 1 página + contenido)
  const ROWS_FIRST_PAGE = Math.floor((650 - 34 - 8 - HEADER_ROW_H - 18) / ROW_H);
  const ROWS_OTHER_PAGE = Math.floor((650 - 34 - 8 - HEADER_ROW_H - 18) / ROW_H);
  const contentRows      = productos.length;
  let totalContentPages  = 1;
  if (contentRows > ROWS_FIRST_PAGE) {
    totalContentPages += Math.ceil((contentRows - ROWS_FIRST_PAGE) / ROWS_OTHER_PAGE);
  }
  const totalPages = 1 + totalContentPages; // portada + contenido

  const doc    = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, autoFirstPage: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  // ── Portada ──
  await drawCoverPage(doc, {
    empresaNombre:    empresa.nombre,
    empresaDireccion: empresa.direccion,
    logoUrl:          empresa.logoUrl,
    fecha:            generatedAt,
    totalProductos:   productos.length,
    filterLabel,
  });

  // ── Páginas de contenido ──
  let pageNum     = 2;
  let rowIndex    = 0;
  let isFirstPage = true;

  function startContentPage() {
    let contentY = drawSectionHeader(doc, {
      empresaNombre: empresa.nombre,
      fecha:         generatedAt,
      pageNum,
      totalPages,
    });
    contentY = drawTableHeader(doc, contentY);
    return contentY;
  }

  let currentY = startContentPage();
  const bottomLimit = doc.page.height - MARGIN - 18 - ROW_H - 4; // margen inferior + footer + una fila de seguridad

  if (productos.length === 0) {
    // Estado vacío
    doc
      .rect(MARGIN, currentY, USABLE_W, 48)
      .fill('#F8FAFC');
    doc
      .fillColor(COLOR.textMuted)
      .font('Helvetica')
      .fontSize(10)
      .text('No hay productos seleccionados para esta lista.', MARGIN, currentY + 16, {
        width: USABLE_W,
        align: 'center',
      });
    currentY += 48;
  }

  for (const producto of productos) {
    // ¿Necesita nueva página?
    if (currentY + ROW_H > bottomLimit) {
      // Leyenda en la última fila de la página actual
      drawColorLegend(doc, currentY);
      drawFooter(doc, { empresaNombre: empresa.nombre, pageNum, totalPages });
      doc.addPage();
      pageNum++;
      isFirstPage = false;
      currentY = startContentPage();
    }

    drawProductRow(doc, producto, rowIndex, currentY);
    currentY += ROW_H;
    rowIndex++;
  }

  // Leyenda al pie de la última página de contenido
  if (productos.length > 0) {
    currentY += 4;
    if (currentY + 18 <= bottomLimit) {
      drawColorLegend(doc, currentY);
      currentY += 18;
    }
  }

  // Resumen final
  if (currentY + 36 <= bottomLimit) {
    currentY += 8;
    doc.rect(MARGIN, currentY, USABLE_W, 28).fill(COLOR.accentLight);
    doc
      .save()
      .moveTo(MARGIN, currentY)
      .lineTo(MARGIN + USABLE_W, currentY)
      .strokeColor(COLOR.accent)
      .lineWidth(1)
      .stroke()
      .restore();
    doc
      .fillColor(COLOR.accentText)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(
        `Total de productos en lista: ${productos.length}   ·   Documento generado el ${formatDate(generatedAt)}`,
        MARGIN + 10,
        currentY + 9,
        { width: USABLE_W - 20, align: 'center', lineBreak: false }
      );
    currentY += 28;
  }

  drawFooter(doc, { empresaNombre: empresa.nombre, pageNum, totalPages });

  return new Promise((resolve, reject) => {
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = { buildSupplierOrderPdf };
