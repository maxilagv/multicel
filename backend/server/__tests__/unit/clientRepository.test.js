/**
 * Tests de la capa de repositorio de clientes
 *
 * Estrategia: mockear pg.js (query + withTransaction) para testear
 * la lógica de construcción de SQL sin necesitar base de datos real.
 * Verificamos: filtros correctos, paginación, soft-deletes.
 */

jest.mock('../../db/pg', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../../db/schemaSupport', () => ({
  tableExists: jest.fn().mockResolvedValue(true),
  columnExists: jest.fn().mockResolvedValue(true),
}));

const { query, withTransaction } = require('../../db/pg');
const clientRepo = require('../../db/repositories/clientRepository');

beforeEach(() => {
  query.mockReset();
  withTransaction.mockReset();
  withTransaction.mockImplementation(async (fn) => fn({ query }));
});

describe('clientRepository.list()', () => {
  beforeEach(() => {
    query.mockResolvedValue({ rows: [] });
  });

  it('llama a query con SQL de clientes', async () => {
    await clientRepo.list();
    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT/i);
    expect(sql).toMatch(/FROM clientes/i);
  });

  it('filtra por deleted_at IS NULL por defecto', async () => {
    await clientRepo.list();
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/clientes\.deleted_at IS NULL/);
  });

  it('onlyDeleted=true filtra por deleted_at IS NOT NULL', async () => {
    await clientRepo.list({ onlyDeleted: true });
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/clientes\.deleted_at IS NOT NULL/);
  });

  it('includeDeleted=true no aplica filtro WHERE en deleted_at', async () => {
    await clientRepo.list({ includeDeleted: true });
    const [sql] = query.mock.calls[0];
    // deleted_at aparece en SELECT columns pero NO en el WHERE como filtro
    expect(sql).not.toMatch(/WHERE.*deleted_at/s);
  });

  it('búsqueda por q agrega filtro LOWER(nombre) LIKE', async () => {
    await clientRepo.list({ q: 'garcia' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/LOWER\(clientes\.nombre\)/i);
    expect(params).toContain('%garcia%');
  });

  it('filtro por estado agrega WHERE estado = ?', async () => {
    await clientRepo.list({ estado: 'activo' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/clientes\.estado = /);
    expect(params).toContain('activo');
  });

  it('filtro por tipo_cliente funciona', async () => {
    await clientRepo.list({ tipo_cliente: 'mayorista' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/clientes\.tipo_cliente = /);
    expect(params).toContain('mayorista');
  });

  it('respeta el límite máximo de 200', async () => {
    await clientRepo.list({ limit: 9999 });
    const [, params] = query.mock.calls[0];
    // El límite real (penúltimo parámetro) no debe superar 200
    const limitParam = params[params.length - 2];
    expect(limitParam).toBeLessThanOrEqual(200);
  });

  it('devuelve los rows de la query', async () => {
    const mockRows = [
      { id: 1, nombre: 'Juan', apellido: 'García', estado: 'activo' },
      { id: 2, nombre: 'Ana', apellido: 'López', estado: 'activo' },
    ];
    query.mockResolvedValue({ rows: mockRows });
    const result = await clientRepo.list();
    expect(result).toEqual(mockRows);
  });
});

describe('clientRepository.create()', () => {
  it('inserta cliente con los campos correctos', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 42, nombre: 'Test' }] })
      .mockResolvedValueOnce({ rows: [{ id: 900 }] });
    const result = await clientRepo.create({ nombre: 'Test', email: 'test@test.com' });
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO clientes/i);
    expect(params).toContain('Test');
    expect(params).toContain('test@test.com');
    expect(result).toEqual({ id: 42, nombre: 'Test' });
  });
});

describe('clientRepository.findById()', () => {
  it('busca por id correcto', async () => {
    query.mockResolvedValue({ rows: [{ id: 5, nombre: 'Test' }] });
    const result = await clientRepo.findById(5);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE/);
    expect(params).toContain(5);
    expect(result).toMatchObject({ id: 5 });
  });

  it('devuelve null si no hay resultado', async () => {
    query.mockResolvedValue({ rows: [] });
    const result = await clientRepo.findById(999);
    expect(result).toBeNull();
  });
});

describe('clientRepository.update()', () => {
  it('actualiza solo los campos enviados', async () => {
    query.mockResolvedValue({ rows: [{ id: 3, nombre: 'Nuevo', estado: 'activo' }] });
    await clientRepo.update(3, { nombre: 'Nuevo' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE clientes/i);
    expect(params).toContain('Nuevo');
    expect(params).toContain(3);
  });
});

describe('clientRepository.remove() — soft delete', () => {
  it('hace soft delete con deleted_at (cliente inactivo)', async () => {
    // El cliente debe estar inactivo para poder eliminarlo
    query
      .mockResolvedValueOnce({ rows: [{ id: 7, estado: 'inactivo', deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ deuda_pendiente: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] });
    await clientRepo.remove(7);
    const allSQLs = query.mock.calls.map(([sql]) => sql);
    const hasUpdate = allSQLs.some((sql) => /UPDATE clientes/i.test(sql) && /deleted_at/i.test(sql));
    expect(hasUpdate).toBe(true);
    const hasDelete = allSQLs.some((sql) => /DELETE FROM clientes/i.test(sql));
    expect(hasDelete).toBe(false);
  });

  it('lanza error si el cliente está activo', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 7, estado: 'activo', deleted_at: null }] });
    await expect(clientRepo.remove(7)).rejects.toMatchObject({ status: 400 });
  });

  it('devuelve null si el cliente no existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const result = await clientRepo.remove(999);
    expect(result).toBeNull();
  });
});

describe('clientRepository.restore()', () => {
  it('limpia deleted_at para restaurar el cliente', async () => {
    query.mockResolvedValue({ rows: [{ id: 7 }] });
    await clientRepo.restore(7);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE clientes/i);
    expect(params).toContain(7);
  });
});
