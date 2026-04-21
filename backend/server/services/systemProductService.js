const categoryRepo = require('../db/repositories/categoryRepository');
const productRepo = require('../db/repositories/productRepository');

const SYSTEM_CATEGORY_NAME = 'Servicios de sistema';

function buildCode(suffix) {
  return `SYS-${String(suffix || 'GEN').trim().toUpperCase()}`;
}

async function ensureSystemCategory() {
  const existing = await categoryRepo.findByName(SYSTEM_CATEGORY_NAME);
  if (existing?.id) return Number(existing.id);

  const created = await categoryRepo.restoreOrInsert({
    name: SYSTEM_CATEGORY_NAME,
    description: 'Categoria tecnica para facturacion de servicios generados por el sistema',
    parent_id: null,
    sort_order: 999,
  });
  return Number(created.id);
}

async function ensureServiceProduct({ code, name, description }) {
  const finalCode = buildCode(code);
  const existing = await productRepo.findByCodigo(finalCode);
  if (existing?.id) return Number(existing.id);

  const categoryId = await ensureSystemCategory();
  const created = await productRepo.createProduct({
    codigo: finalCode,
    name,
    description: description || null,
    category_id: categoryId,
    price: 0,
    price_local: 0,
    price_distribuidor: 0,
    precio_costo_pesos: 0,
    precio_costo_dolares: 0,
    margen_local: 0,
    margen_distribuidor: 0,
    comision_pct: 0,
    precio_modo: 'manual',
    stock_quantity: 0,
  });

  return Number(created.id);
}

module.exports = {
  ensureServiceProduct,
};
