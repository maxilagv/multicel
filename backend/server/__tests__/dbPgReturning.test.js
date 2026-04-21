const { __test__ } = require('../db/pg');

describe('db/pg RETURNING emulation', () => {
  test('update RETURNING id no fabrica filas si affectedRows = 0', async () => {
    const rows = await __test__.buildReturningRows(
      { query: jest.fn() },
      'UPDATE whatsapp_campaign_recipients SET estado = ? WHERE id = ?',
      'id',
      ['sending', 17],
      { affectedRows: 0 }
    );

    expect(rows).toEqual([]);
  });

  test('delete RETURNING id no fabrica filas si affectedRows = 0', async () => {
    const rows = await __test__.buildReturningRows(
      { query: jest.fn() },
      'DELETE FROM clientes WHERE id = ?',
      'id',
      [33],
      { affectedRows: 0 }
    );

    expect(rows).toEqual([]);
  });

  test('update RETURNING id devuelve el id cuando hubo cambios', async () => {
    const rows = await __test__.buildReturningRows(
      { query: jest.fn() },
      'UPDATE whatsapp_campaign_recipients SET estado = ? WHERE id = ?',
      'id',
      ['sending', 44],
      { affectedRows: 1 }
    );

    expect(rows).toEqual([{ id: 44 }]);
  });

  test('update RETURNING * consulta la fila solo si hubo cambios', async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([[{ id: 55, estado: 'sending' }]]),
    };

    const rows = await __test__.buildReturningRows(
      conn,
      'UPDATE whatsapp_campaign_recipients SET estado = ? WHERE id = ?',
      '*',
      ['sending', 55],
      { affectedRows: 1 }
    );

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([{ id: 55, estado: 'sending' }]);
  });
});
