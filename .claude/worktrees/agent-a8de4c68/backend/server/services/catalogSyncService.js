// Cloud-only runtime: catalog writes are already central in MySQL.
// Keep these hooks as no-op to avoid breaking repository calls.
async function enqueueProduct() {}

async function enqueueProductDelete() {}

async function enqueueCategory() {}

async function enqueueCategoryDelete() {}

async function enqueueCatalogConfig() {}

module.exports = {
  enqueueProduct,
  enqueueProductDelete,
  enqueueCategory,
  enqueueCategoryDelete,
  enqueueCatalogConfig,
};
