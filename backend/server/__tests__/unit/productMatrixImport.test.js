const ExcelJS = require('exceljs');
const {
  detectProductCategoryMatrix,
  extractProductCategoryMatrixRows,
  resolveBrandFromModel,
} = require('../../utils/productMatrixImport');

function buildWorksheet(rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Hoja1');

  rows.forEach((cells, index) => {
    worksheet.insertRow(index + 1, cells);
  });

  return worksheet;
}

describe('utils/productMatrixImport', () => {
  test('detecta una matriz Modelo x Subcategoria sin marcadores y genera cruce completo', () => {
    const worksheet = buildWorksheet([
      ['Modelo', 'Transp.', 'Azul'],
      ['A01', '', ''],
      ['A03', '', ''],
    ]);

    const detected = detectProductCategoryMatrix(worksheet);
    const items = extractProductCategoryMatrixRows(worksheet, {
      rootCategory: 'Fundas',
    });

    expect(detected).toMatchObject({
      headerRowIndex: 1,
      modelColumn: 1,
      fullCrossMode: true,
    });
    expect(detected.variants.map((variant) => variant.label)).toEqual([
      'Transp.',
      'Azul',
    ]);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      rowIndex: 2,
      name: 'A01',
      modelo: 'A01',
      brand: 'Samsung',
      categoryPath: ['Fundas', 'Samsung', 'Transp.'],
      price: 0,
      allowZeroPrice: true,
    });
    expect(items[3]).toMatchObject({
      rowIndex: 3,
      name: 'A03',
      brand: 'Samsung',
      categoryPath: ['Fundas', 'Samsung', 'Azul'],
    });
  });

  test('si hay marcadores explicitos solo toma las combinaciones marcadas', () => {
    const worksheet = buildWorksheet([
      ['Modelo', 'Transp.', 'Azul'],
      ['A01', 'x', ''],
      ['A03', '', 'SI'],
      ['A05', 0, 1],
    ]);

    const detected = detectProductCategoryMatrix(worksheet);
    const items = extractProductCategoryMatrixRows(worksheet, {
      rootCategory: 'Fundas',
    });

    expect(detected).toMatchObject({
      fullCrossMode: false,
      explicitMarkers: 4,
    });
    expect(items).toEqual([
      expect.objectContaining({
        rowIndex: 2,
        name: 'A01',
        brand: 'Samsung',
        categoryPath: ['Fundas', 'Samsung', 'Transp.'],
      }),
      expect.objectContaining({
        rowIndex: 3,
        name: 'A03',
        brand: 'Samsung',
        categoryPath: ['Fundas', 'Samsung', 'Azul'],
      }),
      expect.objectContaining({
        rowIndex: 4,
        name: 'A05',
        brand: 'Samsung',
        categoryPath: ['Fundas', 'Samsung', 'Azul'],
      }),
    ]);
  });

  test('resuelve marcas conocidas desde el modelo', () => {
    expect(resolveBrandFromModel('A01 CORE')).toBe('Samsung');
    expect(resolveBrandFromModel('G54')).toBe('Motorola');
    expect(resolveBrandFromModel('IPHONE 15 PRO')).toBe('iPhone');
    expect(resolveBrandFromModel('Redmi Note 13')).toBe('Redmi');
    expect(resolveBrandFromModel('Xiaomi 15')).toBe('Xiaomi');
    expect(resolveBrandFromModel('POCO X6 PRO 5g')).toBe('Poco');
    expect(resolveBrandFromModel('Nubia Focus 5g')).toBe('Nubia');
  });

  test('no detecta una matriz si no existe encabezado de modelo', () => {
    const worksheet = buildWorksheet([
      ['Nombre', 'Categoria', 'Precio'],
      ['Producto 1', 'Fundas > Transp.', '1000'],
    ]);

    expect(detectProductCategoryMatrix(worksheet)).toBeNull();
    expect(
      extractProductCategoryMatrixRows(worksheet, { rootCategory: 'Fundas' })
    ).toEqual([]);
  });
});
