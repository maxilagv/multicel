const categoryRepo = require('../db/repositories/categoryRepository');
const productRepo = require('../db/repositories/productRepository');
const catalogSync = require('./catalogSyncService');

async function enqueueFullSnapshot(usuarioId) {
  const [categories, products] = await Promise.all([
    categoryRepo.getAllActive(),
    productRepo.listCatalog(),
  ]);
  for (const cat of categories) {
    if (cat?.id) {
      await catalogSync.enqueueCategory(Number(cat.id));
    }
  }
  for (const prod of products) {
    if (prod?.id) {
      await catalogSync.enqueueProduct(Number(prod.id));
    }
  }
  await catalogSync.enqueueCatalogConfig(usuarioId);
}

module.exports = { enqueueFullSnapshot };
