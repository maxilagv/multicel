'use strict';

/**
 * Servicio para generar y parsear la plantilla de compra de fundas en formato Excel.
 *
 * Formato del Excel generado:
 *   Hoja visible "Pedido":
 *     Fila 1: celdas de meta (Proveedor, Fecha, Moneda, Tipo de cambio)
 *     Fila 2: Costo unitario (opcional — aplica a todos si se completa)
 *     Fila 3: separador vacío
 *     Fila 4: encabezado de sección "── SAMSUNG ──" (merged, estilizado)
 *     Fila 5: encabezados de columna: Modelo | Transp. | Azul | ...
 *     Filas 6+: modelos de esa marca con celdas vacías para cantidad
 *     (repite para cada marca)
 *
 *   Hoja oculta "_mapa":
 *     Columnas: row | col | sku
 *     Una fila por cada celda de cantidad en la hoja Pedido.
 *     El parser usa esta hoja para saber qué SKU corresponde a cada celda.
 */

const ExcelJS = require('exceljs');
const { query } = require('../db/pg');

// Orden de colores (columnas) — igual que el fundas.xlsx original
const COLORES = ['Transp.', 'Azul', 'Rojo', 'Lila', 'Rosa', 'Fuscia', 'Verde', 'Negro', 'Hombre', 'Mujer', 'Brillo', 'ARMOR', 'Silicona'];

const HEADER_BG   = '1e293b'; // slate-800
const BRAND_BG    = '312e81'; // indigo-900
const LABEL_BG    = '0f172a'; // slate-950
const META_BG     = '1e293b';
const WHITE       = 'FFFFFF';
const AMBER       = 'fbbf24';
const SLATE_400   = '94a3b8';
const SLATE_200   = 'e2e8f0';
const EMERALD     = '10b981';
const PURPLE      = 'a78bfa';

async function queryFundasProducts() {
  const { rows } = await query(
    `SELECT p.id, p.codigo, p.nombre AS modelo, c2.nombre AS marca, c3.nombre AS color
     FROM productos p
     JOIN categorias c3 ON p.categoria_id = c3.id
     JOIN categorias c2 ON c3.parent_id = c2.id
     JOIN categorias c1 ON c2.parent_id = c1.id
     WHERE c1.nombre = 'fundas'
       AND p.deleted_at IS NULL
     ORDER BY c2.nombre, p.nombre, c3.nombre`
  );
  return rows;
}

/**
 * Genera la plantilla Excel de compra de fundas.
 * @returns {Promise<Buffer>} Buffer del archivo .xlsx
 */
async function generarPlantilla() {
  const productos = await queryFundasProducts();

  // Agrupar: marca → modelo → { color → sku }
  const marcas = {};
  for (const p of productos) {
    if (!marcas[p.marca]) marcas[p.marca] = {};
    if (!marcas[p.marca][p.modelo]) marcas[p.marca][p.modelo] = {};
    marcas[p.marca][p.modelo][p.color] = p.codigo;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kaisen ERP';

  // ── Hoja Pedido ──────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Pedido', {
    properties: { tabColor: { argb: 'FF' + PURPLE } },
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  const totalCols = 1 + COLORES.length; // Modelo + colores
  ws.columns = [
    { key: 'modelo', width: 28 },
    ...COLORES.map((c) => ({ key: c, width: 9 })),
  ];

  // ── Fila 1: Proveedor / Fecha / Moneda / Tipo cambio ────────────────────────
  ws.getRow(1).height = 22;
  const metaStyle = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + META_BG } },
    font: { color: { argb: 'FF' + SLATE_400 }, size: 9 },
    alignment: { vertical: 'middle' },
    border: { bottom: { style: 'thin', color: { argb: '22' + WHITE } } },
  };
  const metaValueStyle = {
    ...metaStyle,
    font: { color: { argb: 'FF' + SLATE_200 }, bold: true, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2942' } },
    border: {
      bottom: { style: 'thin', color: { argb: 'FF' + EMERALD } },
      left:   { style: 'thin', color: { argb: '22' + WHITE } },
    },
  };

  const setMeta = (col, label, isValue = false) => {
    const cell = ws.getCell(1, col);
    cell.value = label;
    Object.assign(cell, isValue ? metaValueStyle : metaStyle);
  };

  setMeta(1, 'PROVEEDOR:');
  setMeta(2, ''); // user fills this
  ws.getCell(1, 2).style = metaValueStyle;

  setMeta(3, '  FECHA:');
  setMeta(4, new Date().toISOString().slice(0, 10)); // default today
  ws.getCell(1, 4).style = metaValueStyle;

  setMeta(5, '  MONEDA:');
  setMeta(6, 'USD');
  ws.getCell(1, 6).style = metaValueStyle;

  setMeta(7, '  TIPO CAMBIO:');
  setMeta(8, '');
  ws.getCell(1, 8).style = metaValueStyle;

  // Fill remaining cols in row 1 with background
  for (let c = 9; c <= totalCols; c++) {
    ws.getCell(1, c).style = metaStyle;
  }

  // ── Fila 2: Costo unitario ───────────────────────────────────────────────────
  ws.getRow(2).height = 20;
  const costStyle = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LABEL_BG } },
    font: { color: { argb: 'FF' + AMBER }, size: 9, italic: true },
    alignment: { vertical: 'middle' },
  };
  ws.getCell(2, 1).value = 'COSTO UNITARIO (opcional, aplica igual a todos):';
  ws.getCell(2, 1).style = costStyle;
  ws.mergeCells(2, 1, 2, 3);

  ws.getCell(2, 4).value = '';
  ws.getCell(2, 4).style = {
    ...costStyle,
    font: { color: { argb: 'FF' + SLATE_200 }, bold: true, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2942' } },
    border: { bottom: { style: 'thin', color: { argb: 'FF' + AMBER } } },
  };

  const noteStyle = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LABEL_BG } },
    font: { color: { argb: '66' + WHITE }, size: 8, italic: true },
    alignment: { vertical: 'middle' },
  };
  for (let c = 5; c <= totalCols; c++) {
    ws.getCell(2, c).style = noteStyle;
  }
  ws.getCell(2, 5).value = '← completar o dejar vacío';

  // ── Fila 3: separador ───────────────────────────────────────────────────────
  ws.getRow(3).height = 6;
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(3, c).style = {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0f172a' } },
    };
  }

  // ── Secciones por marca ──────────────────────────────────────────────────────
  let currentRow = 4;

  const marcaNames = Object.keys(marcas).sort();

  for (const marca of marcaNames) {
    const modelos = marcas[marca];
    const modeloNames = Object.keys(modelos).sort();

    // Brand header row
    ws.getRow(currentRow).height = 18;
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const brandCell = ws.getCell(currentRow, 1);
    brandCell.value = `── ${marca.toUpperCase()} ──`;
    brandCell.style = {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BRAND_BG } },
      font: { color: { argb: 'FF' + PURPLE }, bold: true, size: 10, italic: true },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };
    currentRow++;

    // Column header row
    ws.getRow(currentRow).height = 18;
    const colHeaderStyle = {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + HEADER_BG } },
      font: { color: { argb: 'FF' + SLATE_400 }, bold: true, size: 8 },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: { bottom: { style: 'thin', color: { argb: '33' + WHITE } } },
    };
    ws.getCell(currentRow, 1).value = 'Modelo';
    ws.getCell(currentRow, 1).style = {
      ...colHeaderStyle,
      font: { color: { argb: 'FF' + SLATE_200 }, bold: true, size: 9 },
      alignment: { horizontal: 'left', vertical: 'middle' },
    };
    COLORES.forEach((color, i) => {
      ws.getCell(currentRow, 2 + i).value = color;
      ws.getCell(currentRow, 2 + i).style = colHeaderStyle;
    });
    currentRow++;

    // Model rows
    for (const modelo of modeloNames) {
      const colors = modelos[modelo];
      ws.getRow(currentRow).height = 16;
      const isEven = (currentRow % 2 === 0);

      // Modelo cell
      ws.getCell(currentRow, 1).value = modelo;
      ws.getCell(currentRow, 1).style = {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FF162032' : 'FF1a2942' } },
        font: { color: { argb: 'FF' + SLATE_200 }, size: 9 },
        alignment: { vertical: 'middle' },
      };

      // Color/qty cells
      COLORES.forEach((color, i) => {
        const col = 2 + i;
        const cell = ws.getCell(currentRow, col);
        const hasSku = !!colors[color];
        cell.value = hasSku ? null : undefined; // blank if product exists, undefined if not in DB
        cell.style = {
          fill: {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: hasSku ? (isEven ? 'FF0f172a' : 'FF111827') : 'FF0a0f1a' },
          },
          font: { color: { argb: 'FF' + AMBER }, bold: true, size: 10 },
          alignment: { horizontal: 'center', vertical: 'middle' },
          border: hasSku ? {
            top:    { style: 'hair', color: { argb: '22' + WHITE } },
            left:   { style: 'hair', color: { argb: '22' + WHITE } },
            right:  { style: 'hair', color: { argb: '22' + WHITE } },
            bottom: { style: 'hair', color: { argb: '22' + WHITE } },
          } : {},
        };
        if (!hasSku) {
          cell.style.fill.fgColor.argb = 'FF080d15';
        }
      });

      currentRow++;
    }

    // Spacer after brand
    ws.getRow(currentRow).height = 6;
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(currentRow, c).style = {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0a0f1a' } },
      };
    }
    currentRow++;
  }

  // ── Hoja _mapa (oculta) ──────────────────────────────────────────────────────
  const wsMapa = wb.addWorksheet('_mapa', { state: 'veryHidden' });
  wsMapa.columns = [
    { header: 'row', key: 'row', width: 8 },
    { header: 'col', key: 'col', width: 8 },
    { header: 'sku', key: 'sku', width: 20 },
  ];

  // Rebuild the row map by replaying the layout logic
  let scanRow = 4;
  for (const marca of marcaNames) {
    const modelos = marcas[marca];
    const modeloNames = Object.keys(modelos).sort();
    scanRow++; // brand header
    scanRow++; // col header
    for (const modelo of modeloNames) {
      const colors = modelos[modelo];
      COLORES.forEach((color, i) => {
        const sku = colors[color];
        if (sku) {
          wsMapa.addRow({ row: scanRow, col: 2 + i, sku });
        }
      });
      scanRow++;
    }
    scanRow++; // spacer
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf;
}

/**
 * Parsea una plantilla de compra de fundas subida por el usuario.
 * @param {Buffer} buffer
 * @returns {{ proveedor: string, fecha: string, moneda: string, tipo_cambio: number|null, costo_unitario: number|null, items: Array<{sku:string, cantidad:number}> }}
 */
async function parsearPlantilla(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const wsMapa = wb.getWorksheet('_mapa');
  if (!wsMapa) throw new Error('El archivo no es una plantilla válida (falta hoja _mapa).');

  const ws = wb.getWorksheet('Pedido');
  if (!ws) throw new Error('El archivo no es una plantilla válida (falta hoja Pedido).');

  // Read _mapa into a lookup: "row:col" → sku
  const mapa = {};
  wsMapa.eachRow((row, ri) => {
    if (ri === 1) return; // header
    const r = row.getCell(1).value;
    const c = row.getCell(2).value;
    const sku = row.getCell(3).value;
    if (r && c && sku) mapa[`${r}:${c}`] = String(sku);
  });

  // Read meta from row 1
  const getCellVal = (r, c) => {
    const v = ws.getCell(r, c).value;
    return v != null ? String(v).trim() : '';
  };

  const proveedor    = getCellVal(1, 2);
  const fecha        = getCellVal(1, 4) || new Date().toISOString().slice(0, 10);
  const moneda       = getCellVal(1, 6) || 'USD';
  const tipoCambioRaw = getCellVal(1, 8);
  const tipo_cambio  = tipoCambioRaw ? Number(tipoCambioRaw) || null : null;

  const costoUnitRaw = getCellVal(2, 4);
  const costo_unitario = costoUnitRaw ? Number(costoUnitRaw) || null : null;

  if (!proveedor) throw new Error('El campo PROVEEDOR está vacío. Completalo antes de subir la plantilla.');

  // Collect items
  const items = [];
  ws.eachRow((row, rowNum) => {
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const sku = mapa[`${rowNum}:${colNum}`];
      if (!sku) return;
      const qty = Number(cell.value);
      if (qty > 0 && Number.isInteger(qty)) {
        items.push({ sku, cantidad: qty });
      }
    });
  });

  if (items.length === 0) throw new Error('No se encontraron cantidades en la plantilla. Completá al menos una celda.');

  return { proveedor, fecha, moneda, tipo_cambio, costo_unitario, items };
}

module.exports = { generarPlantilla, parsearPlantilla };
