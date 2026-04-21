#!/usr/bin/env node
const path = require('path');
const ExcelJS = require('exceljs');
const {
  detectProductCategoryMatrix,
  extractProductCategoryMatrixRows,
} = require('../utils/productMatrixImport');

async function main() {
  const input = process.argv[2];
  const rootCategory = process.argv[3] || 'fundas';

  if (!input) {
    throw new Error('Uso: node scripts/preview-product-matrix.js <archivo.xlsx> [categoria_raiz]');
  }

  const filePath = path.resolve(process.cwd(), input);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error('No se encontro una hoja en el archivo');
  }

  const detected = detectProductCategoryMatrix(worksheet);
  const rows = extractProductCategoryMatrixRows(worksheet, {
    rootCategory,
  });

  const byVariant = rows.reduce((acc, row) => {
    const variant = row.categoryPath?.[2] || 'sin_subcategoria';
    acc[variant] = (acc[variant] || 0) + 1;
    return acc;
  }, {});
  const byBrand = rows.reduce((acc, row) => {
    const brand = row.brand || 'sin_marca';
    acc[brand] = (acc[brand] || 0) + 1;
    return acc;
  }, {});
  const unresolved = rows
    .filter((row) => row.brandError)
    .map((row) => ({
      rowIndex: row.rowIndex,
      name: row.name,
      brandError: row.brandError,
    }));

  console.log(
    JSON.stringify(
      {
        file: filePath,
        worksheet: worksheet.name,
        detected,
        total_rows: rows.length,
        by_variant: byVariant,
        by_brand: byBrand,
        unresolved,
        sample: rows.slice(0, 20),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
