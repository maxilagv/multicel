const { query, withTransaction } = require('../../db/pg');
const { tableExists } = require('../../db/schemaSupport');

function normalizeIds(clienteId, depositoId) {
  const clientId = Number(clienteId);
  const depId = Number(depositoId);
  if (!Number.isInteger(clientId) || clientId <= 0) return null;
  if (!Number.isInteger(depId) || depId <= 0) return null;
  return { clientId, depId };
}

async function linkClienteDepositoTx(client, clienteId, depositoId) {
  const normalized = normalizeIds(clienteId, depositoId);
  if (!normalized) return;
  if (!(await tableExists('clientes_depositos', client))) return;
  await client.query(
    `INSERT INTO clientes_depositos(cliente_id, deposito_id)
     VALUES ($1, $2)
     ON CONFLICT (cliente_id, deposito_id) DO NOTHING`,
    [normalized.clientId, normalized.depId]
  );
}

async function linkClienteDeposito(clienteId, depositoId) {
  return withTransaction(async (client) => {
    await linkClienteDepositoTx(client, clienteId, depositoId);
  });
}

async function listDepositoIdsByCliente(clienteId) {
  const clientId = Number(clienteId);
  if (!Number.isInteger(clientId) || clientId <= 0) return [];
  if (!(await tableExists('clientes_depositos'))) return [];
  const { rows } = await query(
    `SELECT deposito_id
       FROM clientes_depositos
      WHERE cliente_id = $1
      ORDER BY deposito_id ASC`,
    [clientId]
  );
  return rows.map((row) => Number(row.deposito_id)).filter((id) => Number.isInteger(id) && id > 0);
}

module.exports = {
  linkClienteDepositoTx,
  linkClienteDeposito,
  listDepositoIdsByCliente,
};
