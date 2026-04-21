const { query } = require('../pg');

async function getNumericParam(key) {
  const { rows } = await query(
    'SELECT valor_num FROM parametros_sistema WHERE clave = $1 LIMIT 1',
    [key]
  );
  if (!rows.length) return null;
  const val = rows[0].valor_num;
  return val == null ? null : Number(val);
}

async function getTextParam(key) {
  const { rows } = await query(
    'SELECT valor_texto FROM parametros_sistema WHERE clave = $1 LIMIT 1',
    [key]
  );
  if (!rows.length) return null;
  const val = rows[0].valor_texto;
  return val == null ? null : String(val);
}

async function setNumericParam(key, value, usuarioId) {
  await query(
    `INSERT INTO parametros_sistema(clave, valor_num, usuario_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (clave) DO UPDATE
       SET valor_num = EXCLUDED.valor_num,
           usuario_id = EXCLUDED.usuario_id,
           actualizado_en = NOW()`,
    [key, value, usuarioId || null]
  );
}

async function setTextParam(key, value, usuarioId) {
  await query(
    `INSERT INTO parametros_sistema(clave, valor_texto, usuario_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (clave) DO UPDATE
       SET valor_texto = EXCLUDED.valor_texto,
           usuario_id = EXCLUDED.usuario_id,
           actualizado_en = NOW()`,
    [key, value, usuarioId || null]
  );
}

async function getDolarBlue() {
  return getNumericParam('dolar_blue');
}

async function setDolarBlue(valor, usuarioId) {
  return setNumericParam('dolar_blue', valor, usuarioId);
}

async function getDebtThreshold() {
  return getNumericParam('deuda_umbral_rojo');
}

async function setDebtThreshold(valor, usuarioId) {
  return setNumericParam('deuda_umbral_rojo', valor, usuarioId);
}

async function getNetworkPolicy() {
  return getTextParam('network_policy');
}

async function setNetworkPolicy(value, usuarioId) {
  return setTextParam('network_policy', value, usuarioId);
}

async function getNetworkSubnet() {
  return getTextParam('network_subnet');
}

async function setNetworkSubnet(value, usuarioId) {
  return setTextParam('network_subnet', value, usuarioId);
}

module.exports = {
  getNumericParam,
  getTextParam,
  setNumericParam,
  setTextParam,
  getDolarBlue,
  setDolarBlue,
  getDebtThreshold,
  setDebtThreshold,
  getNetworkPolicy,
  setNetworkPolicy,
  getNetworkSubnet,
  setNetworkSubnet,
};
