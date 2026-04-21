const ExcelJS = require('exceljs');

jest.mock('../../db/repositories/productRepository', () => ({
  findByCodigo: jest.fn().mockResolvedValue(null),
  findByNameCategory: jest.fn().mockResolvedValue(null),
  createProduct: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../../db/repositories/categoryRepository', () => ({
  findByName: jest.fn().mockResolvedValue(null),
  findById: jest.fn().mockResolvedValue(null),
  restoreOrInsert: jest.fn().mockResolvedValue({ id: 1, restored: false }),
}));

jest.mock('../../services/importJobService', () => ({
  createJob: jest.fn(),
  getJob: jest.fn(),
  startJob: jest.fn(),
  finishJob: jest.fn(),
  failJob: jest.fn(),
}));

const controller = require('../../controllers/productcontroller');

async function createWorkbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Hoja1');
  rows.forEach((row) => worksheet.addRow(row));
  return workbook.xlsx.writeBuffer();
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return payload;
    },
  };
}

describe('productcontroller importProducts matrix dry_run', () => {
  test('normaliza una matriz de fundas y devuelve preview sin requerir precio', async () => {
    const buffer = await createWorkbookBuffer([
      ['Modelo', 'Transp.', 'Azul'],
      ['A01', '', ''],
      ['A03', '', ''],
    ]);

    const req = {
      file: {
        buffer: Buffer.from(buffer),
        originalname: 'fundas.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      query: {
        dry_run: '1',
      },
    };
    const res = createMockRes();

    await controller.importProducts(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      dry_run: true,
      totals: expect.objectContaining({
        rows: 4,
        would_create: 4,
        created: 0,
        skipped: 0,
        errors: 0,
      }),
    });
    expect(res.body.preview).toEqual([
      expect.objectContaining({
        row: 2,
        name: 'A01',
        categoria: 'fundas > Samsung > Transp.',
        precio: 0,
      }),
      expect.objectContaining({
        row: 2,
        name: 'A01',
        categoria: 'fundas > Samsung > Azul',
        precio: 0,
      }),
      expect.objectContaining({
        row: 3,
        name: 'A03',
        categoria: 'fundas > Samsung > Transp.',
        precio: 0,
      }),
      expect.objectContaining({
        row: 3,
        name: 'A03',
        categoria: 'fundas > Samsung > Azul',
        precio: 0,
      }),
    ]);
  });
});
