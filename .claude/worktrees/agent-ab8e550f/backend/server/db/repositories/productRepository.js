const { query, withTransaction } = require('../../db/pg');
const configRepo = require('./configRepository');
const categoryRepo = require('./categoryRepository');
const inv = require('../../services/inventoryService');
const catalogSync = require('../../services/catalogSyncService');

function appendInFilter(where, params, column, ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const start = params.length + 1;
  const marks = ids.map((_, idx) => `$${start + idx}`).join(', ');
  params.push(...ids);
  where.push(`${column} IN (${marks})`);
}

async function listProducts({
  q,
  categoryId,
  includeDescendants = false,
  page = 1,
  limit = 50,
  offset = 0,
  sort = 'id',
  dir = 'desc',
} = {}) {
  const params = [];
  const where = ['p.activo = TRUE', 'c.activo = TRUE'];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(LOWER(p.nombre) LIKE $${params.length} OR LOWER(p.descripcion) LIKE $${params.length} OR LOWER(p.codigo) LIKE $${params.length})`);
  }
  if (categoryId) {
    const ids = await categoryRepo.getCategoryFilterIds(categoryId, {
      includeDescendants: Boolean(includeDescendants),
      onlyActive: true,
    });
    if (!ids.length) return [];
    appendInFilter(where, params, 'p.categoria_id', ids);
  }

  const sortMap = {
    id: 'p.id',
    name: 'p.nombre',
    price: 'p.precio_venta',
    created_at: 'p.creado_en',
    updated_at: 'p.actualizado_en',
    stock: 'COALESCE(i.cantidad_disponible, 0)'
  };
  const sortCol = sortMap[sort] || sortMap.id;
  const sortDir = String(dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  let sql;
  if (q) {
    // Búsqueda en toda la tabla sin paginación estricta
    sql = `
    SELECT p.id,
           p.codigo AS codigo,
           p.categoria_id AS category_id,
           p.nombre AS name,
           p.descripcion AS description,
           p.precio_venta::float AS price,
           p.precio_costo_pesos::float AS costo_pesos,
           p.precio_costo_dolares::float AS costo_dolares,
           p.tipo_cambio::float AS tipo_cambio,
           p.margen_local::float AS margen_local,
           p.margen_distribuidor::float AS margen_distribuidor,
           p.precio_local::float AS price_local,
           p.precio_distribuidor::float AS price_distribuidor,
           p.comision_pct::float AS comision_pct,
           p.precio_modo AS precio_modo,
           p.precio_final::float AS precio_final,
           p.marca,
           p.modelo,
           p.procesador,
           p.ram_gb,
           p.almacenamiento_gb,
           p.pantalla_pulgadas,
           p.camara_mp,
           p.bateria_mah,
           c.nombre AS category_name,
           c.path AS category_path,
           COALESCE(i.cantidad_disponible, 0) AS stock_quantity,
           p.creado_en AS created_at,
           p.actualizado_en AS updated_at,
           CASE WHEN p.activo THEN NULL ELSE p.actualizado_en END AS deleted_at,
           (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden ASC, id ASC LIMIT 1) AS image_url
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
 LEFT JOIN inventario i ON i.producto_id = p.id
     WHERE ${where.join(' AND ')}
  ORDER BY ${sortCol} ${sortDir}`;
  } else {
    params.push(lim); // $n
    params.push(off); // $n+1
    sql = `
    SELECT p.id,
           p.codigo AS codigo,
           p.categoria_id AS category_id,
           p.nombre AS name,
           p.descripcion AS description,
           p.precio_venta::float AS price,
           p.precio_costo_pesos::float AS costo_pesos,
           p.precio_costo_dolares::float AS costo_dolares,
           p.tipo_cambio::float AS tipo_cambio,
           p.margen_local::float AS margen_local,
           p.margen_distribuidor::float AS margen_distribuidor,
           p.precio_local::float AS price_local,
           p.precio_distribuidor::float AS price_distribuidor,
           p.comision_pct::float AS comision_pct,
           p.precio_modo AS precio_modo,
           p.precio_final::float AS precio_final,
           p.marca,
           p.modelo,
           p.procesador,
           p.ram_gb,
           p.almacenamiento_gb,
           p.pantalla_pulgadas,
           p.camara_mp,
           p.bateria_mah,
           c.nombre AS category_name,
           c.path AS category_path,
           COALESCE(i.cantidad_disponible, 0) AS stock_quantity,
           p.creado_en AS created_at,
           p.actualizado_en AS updated_at,
           CASE WHEN p.activo THEN NULL ELSE p.actualizado_en END AS deleted_at,
           (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden ASC, id ASC LIMIT 1) AS image_url
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
 LEFT JOIN inventario i ON i.producto_id = p.id
     WHERE ${where.join(' AND ')}
  ORDER BY ${sortCol} ${sortDir}
     LIMIT $${params.length - 1}
    OFFSET $${params.length}`;
  }

  const { rows } = await query(sql, params);
  return rows;
}

async function listProductsPaginated({
  q,
  categoryId,
  includeDescendants = false,
  page = 1,
  limit = 50,
  sort = 'id',
  dir = 'desc',
  allowAll = false,
} = {}) {
  const params = [];
  const where = ['p.activo = TRUE', 'c.activo = TRUE'];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(
      `(LOWER(p.nombre) LIKE $${params.length} OR LOWER(p.descripcion) LIKE $${params.length} OR LOWER(p.codigo) LIKE $${params.length})`
    );
  }
  if (categoryId) {
    const ids = await categoryRepo.getCategoryFilterIds(categoryId, {
      includeDescendants: Boolean(includeDescendants),
      onlyActive: true,
    });
    if (!ids.length) {
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), allowAll ? 10000 : 200);
      return { rows: [], total: 0, page: pageNum, limit: lim };
    }
    appendInFilter(where, params, 'p.categoria_id', ids);
  }

  const sortMap = {
    id: 'p.id',
    name: 'p.nombre',
    price: 'p.precio_venta',
    created_at: 'p.creado_en',
    updated_at: 'p.actualizado_en',
    stock: 'COALESCE(i.cantidad_disponible, 0)',
  };
  const sortCol = sortMap[sort] || sortMap.id;
  const sortDir = String(dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const maxLimit = allowAll ? 10000 : 200;
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), maxLimit);
  const off = (pageNum - 1) * lim;

  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  params.push(lim);
  params.push(off);

  const sql = `
    SELECT p.id,
           p.codigo AS codigo,
           p.categoria_id AS category_id,
           p.nombre AS name,
           p.descripcion AS description,
           p.precio_venta::float AS price,
           p.precio_costo_pesos::float AS costo_pesos,
           p.precio_costo_dolares::float AS costo_dolares,
           p.tipo_cambio::float AS tipo_cambio,
           p.margen_local::float AS margen_local,
           p.margen_distribuidor::float AS margen_distribuidor,
           p.precio_local::float AS price_local,
           p.precio_distribuidor::float AS price_distribuidor,
           p.comision_pct::float AS comision_pct,
           p.precio_modo AS precio_modo,
           p.precio_final::float AS precio_final,
           p.marca,
           p.modelo,
           p.procesador,
           p.ram_gb,
           p.almacenamiento_gb,
           p.pantalla_pulgadas,
           p.camara_mp,
           p.bateria_mah,
           c.nombre AS category_name,
           c.path AS category_path,
           COALESCE(i.cantidad_disponible, 0) AS stock_quantity,
           p.creado_en AS created_at,
           p.actualizado_en AS updated_at,
           CASE WHEN p.activo THEN NULL ELSE p.actualizado_en END AS deleted_at,
           (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden ASC, id ASC LIMIT 1) AS image_url,
           COUNT(*) OVER()::bigint AS total_count
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
 LEFT JOIN inventario i ON i.producto_id = p.id
     WHERE ${where.join(' AND ')}
  ORDER BY ${sortCol} ${sortDir}
     LIMIT $${limitIndex}
    OFFSET $${offsetIndex}`;

  const { rows } = await query(sql, params);
  const total = rows.length ? Number(rows[0].total_count) : 0;
  return { rows, total, page: pageNum, limit: lim };
}

function genSkuCandidate() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `SKU-${rand(3)}${Date.now().toString(36).toUpperCase().slice(-3)}`;
}

async function createProduct({
  name,
  description,
  price,
  price_local,
  price_distribuidor,
  codigo,
  image_url,
  category_id,
  stock_quantity,
  precio_costo_pesos,
  precio_costo_dolares,
  tipo_cambio,
  margen_local,
  margen_distribuidor,
  comision_pct,
  precio_modo,
  proveedor_id,
  precio_final,
  marca,
  modelo,
  procesador,
  ram_gb,
  almacenamiento_gb,
  pantalla_pulgadas,
  camara_mp,
  bateria_mah,
}) {
  const initialStock = Number.isFinite(Number(stock_quantity)) && Number(stock_quantity) >= 0 ? Number(stock_quantity) : 0;

  const costoPesos =
    typeof precio_costo_pesos !== 'undefined'
      ? Number(precio_costo_pesos) || 0
      : 0;
  const costoDolares =
    typeof precio_costo_dolares !== 'undefined'
      ? Number(precio_costo_dolares) || 0
      : 0;
  let fx =
    typeof tipo_cambio !== 'undefined' && tipo_cambio !== null
      ? Number(tipo_cambio) || null
      : null;

  // Fase 3: si no viene tipo_cambio, usar dolar_blue global como base
  if ((!fx || fx <= 0) && costoDolares > 0) {
    try {
      const dolarBlue = await configRepo.getDolarBlue();
      if (dolarBlue && Number.isFinite(Number(dolarBlue)) && Number(dolarBlue) > 0) {
        fx = Number(dolarBlue);
      }
    } catch {
      // Si falla la lectura de config, seguimos con fx tal como está
    }
  }

  let costoPesosFinal = costoPesos;
  let costoDolaresFinal = costoDolares;

  if (!costoPesosFinal && costoDolaresFinal && fx) {
    costoPesosFinal = costoDolaresFinal * fx;
  } else if (!costoDolaresFinal && costoPesosFinal && fx && fx !== 0) {
    costoDolaresFinal = costoPesosFinal / fx;
  }

  const margenLocal = typeof margen_local !== 'undefined' ? Number(margen_local) : 0.15;
  const margenDistribuidor = typeof margen_distribuidor !== 'undefined' ? Number(margen_distribuidor) : 0.45;
  const comisionPct = typeof comision_pct !== 'undefined' ? Number(comision_pct) || 0 : 0;
  const categoryId = Number(category_id);
  const priceMode = String(precio_modo || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';

  const basePrecioVenta = Number(price);
  const manualPrecioLocal = Number(price_local);
  const manualPrecioDistribuidor = Number(price_distribuidor);
  const hasManualLocal = Number.isFinite(manualPrecioLocal);
  const hasManualDistribuidor = Number.isFinite(manualPrecioDistribuidor);

  const computedPrecioLocal =
    costoPesosFinal > 0
      ? costoPesosFinal * (1 + margenLocal)
      : basePrecioVenta || 0;
  const computedPrecioDistribuidor =
    costoPesosFinal > 0
      ? costoPesosFinal * (1 + margenDistribuidor)
      : basePrecioVenta || 0;

  const precioLocal =
    priceMode === 'manual'
      ? (hasManualLocal ? manualPrecioLocal : 0)
      : computedPrecioLocal;
  const precioDistribuidor =
    priceMode === 'manual'
      ? (hasManualDistribuidor ? manualPrecioDistribuidor : 0)
      : computedPrecioDistribuidor;
  const precioVentaFinal =
    priceMode === 'manual'
      ? (hasManualLocal ? manualPrecioLocal : basePrecioVenta || precioLocal || 0)
      : computedPrecioLocal;

  return withTransaction(async (client) => {
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      const e = new Error('Invalid category_id');
      e.status = 400;
      throw e;
    }

    const cat = await client.query('SELECT id FROM categorias WHERE id = $1', [categoryId]);
    if (!cat.rowCount) {
      if (process.env.NODE_ENV !== 'production') {
        try {
          const allCats = await client.query('SELECT id, nombre, activo FROM categorias ORDER BY id');
          console.error('Category not found on createProduct', { categoryId, categorias: allCats.rows });
        } catch (e) {
          console.error('Category not found on createProduct (failed to list categories)', { categoryId, error: e?.message });
        }
      }
      const e = new Error('Category not found');
      e.status = 400;
      throw e;
    }

    let codigoFinal = typeof codigo === 'string' ? codigo.trim() : '';
    if (codigoFinal) {
      const exists = await client.query('SELECT 1 FROM productos WHERE codigo = $1 LIMIT 1', [codigoFinal]);
      if (exists.rowCount) {
        const e = new Error('Codigo ya existe');
        e.status = 400;
        throw e;
      }
    } else {
      codigoFinal = genSkuCandidate();
      let tries = 0;
      while (tries < 6) {
        const exists = await client.query('SELECT 1 FROM productos WHERE codigo = $1 LIMIT 1', [codigoFinal]);
        if (!exists.rowCount) break;
        codigoFinal = genSkuCandidate();
        tries++;
      }
    }

    const ins = await client.query(
      `INSERT INTO productos(
         categoria_id,
         codigo,
         nombre,
         descripcion,
         precio_costo,
         precio_venta,
         precio_costo_pesos,
         precio_costo_dolares,
         tipo_cambio,
         margen_local,
         margen_distribuidor,
         precio_local,
         precio_distribuidor,
         comision_pct,
         precio_modo,
         precio_final,
         marca,
         modelo,
         procesador,
         ram_gb,
         almacenamiento_gb,
         pantalla_pulgadas,
         camara_mp,
         bateria_mah,
         proveedor_id,
         activo
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, TRUE)
       RETURNING id`,
      [
        categoryId,
        codigoFinal,
        name,
        description || null,
        costoPesosFinal || 0,
        precioVentaFinal,
        costoPesosFinal || 0,
        costoDolaresFinal || 0,
        fx,
        margenLocal,
        margenDistribuidor,
        precioLocal,
        precioDistribuidor,
        comisionPct,
        priceMode,
        precio_final || 0,
        marca || null,
        modelo || null,
        procesador || null,
        Number.isFinite(Number(ram_gb)) ? Number(ram_gb) : null,
        Number.isFinite(Number(almacenamiento_gb)) ? Number(almacenamiento_gb) : null,
        pantalla_pulgadas != null ? Number(pantalla_pulgadas) : null,
        Number.isFinite(Number(camara_mp)) ? Number(camara_mp) : null,
        Number.isFinite(Number(bateria_mah)) ? Number(bateria_mah) : null,
        proveedor_id || null,
      ]
    );
    const productoId = ins.rows[0].id;

    const defaultDepId = await inv.getDefaultDepositoId(client);
    const stock = initialStock > 0 ? initialStock : 0;
    await client.query(
      `INSERT INTO inventario_depositos(producto_id, deposito_id, cantidad_disponible, cantidad_reservada)
       VALUES ($1, $2, $3, 0)
       ON DUPLICATE KEY UPDATE
         cantidad_disponible = $3,
         actualizado_en = NOW()`,
      [productoId, defaultDepId, stock]
    );
    if (image_url) {
      await client.query(
        `INSERT INTO producto_imagenes(producto_id, url, orden)
         VALUES ($1, $2, 0)
         ON DUPLICATE KEY UPDATE
           url = $2`,
        [productoId, image_url]
      );
    }
    await catalogSync.enqueueProduct(productoId, client);
    return { id: productoId };
  });
}

async function updateProduct(
  id,
  {
    name,
    description,
    price,
    price_local,
    price_distribuidor,
    codigo,
    image_url,
    category_id,
    stock_quantity,
    precio_costo_pesos,
    precio_costo_dolares,
    tipo_cambio,
    margen_local,
    margen_distribuidor,
    comision_pct,
    precio_modo,
    proveedor_id,
    precio_final,
    marca,
    modelo,
    procesador,
    ram_gb,
    almacenamiento_gb,
    pantalla_pulgadas,
    camara_mp,
    bateria_mah,
  }
) {
  const dolarBlue = await configRepo.getDolarBlue().catch(() => null);
  const categoryId = typeof category_id !== 'undefined' ? Number(category_id) : undefined;

  return withTransaction(async (client) => {
    if (typeof category_id !== 'undefined') {
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        const e = new Error('Invalid category_id');
        e.status = 400;
        throw e;
      }
      const cat = await client.query('SELECT id FROM categorias WHERE id = $1', [categoryId]);
      if (!cat.rowCount) {
        if (process.env.NODE_ENV !== 'production') {
          try {
            const allCats = await client.query('SELECT id, nombre, activo FROM categorias ORDER BY id');
            console.error('Category not found on updateProduct', { categoryId, categorias: allCats.rows });
          } catch (e) {
            console.error('Category not found on updateProduct (failed to list categories)', { categoryId, error: e?.message });
          }
        }
        const e = new Error('Category not found');
        e.status = 400;
        throw e;
      }
    }

    const { rows: currentRows } = await client.query(
      `SELECT precio_costo_pesos,
              precio_costo_dolares,
              tipo_cambio,
              margen_local,
              margen_distribuidor,
              precio_modo,
              precio_local,
              precio_distribuidor,
              precio_venta,
              precio_final
         FROM productos
        WHERE id = $1`,
      [id]
    );
    if (!currentRows.length) {
      const e = new Error('Product not found');
      e.status = 404;
      throw e;
    }

    const current = currentRows[0];

    let costoPesosFinal =
      typeof precio_costo_pesos !== 'undefined'
        ? Number(precio_costo_pesos) || 0
        : Number(current.precio_costo_pesos) || 0;
    let costoDolaresFinal =
      typeof precio_costo_dolares !== 'undefined'
        ? Number(precio_costo_dolares) || 0
        : Number(current.precio_costo_dolares) || 0;

    let fx =
      typeof tipo_cambio !== 'undefined'
        ? (tipo_cambio === null ? null : Number(tipo_cambio) || null)
        : current.tipo_cambio;

    // Fase 3: si no hay tipo_cambio válido y tenemos dolar_blue, usarlo
    if ((!fx || Number(fx) <= 0) && costoDolaresFinal > 0 && dolarBlue && Number(dolarBlue) > 0) {
      fx = Number(dolarBlue);
    }

    if (!costoPesosFinal && costoDolaresFinal && fx) {
      costoPesosFinal = costoDolaresFinal * fx;
    } else if (!costoDolaresFinal && costoPesosFinal && fx && fx !== 0) {
      costoDolaresFinal = costoPesosFinal / fx;
    }

    const margenLocal =
      typeof margen_local !== 'undefined'
        ? Number(margen_local)
        : Number(current.margen_local) || 0.15;
    const margenDistribuidor =
      typeof margen_distribuidor !== 'undefined'
        ? Number(margen_distribuidor)
        : Number(current.margen_distribuidor) || 0.45;
    const priceMode =
      typeof precio_modo !== 'undefined'
        ? (String(precio_modo || '').toLowerCase() === 'manual' ? 'manual' : 'auto')
        : (String(current.precio_modo || '').toLowerCase() === 'manual' ? 'manual' : 'auto');

    const sets = [];
    const params = [];
    let p = 1;

    if (typeof category_id !== 'undefined') { sets.push(`categoria_id = $${p++}`); params.push(categoryId); }
    if (typeof name !== 'undefined') { sets.push(`nombre = $${p++}`); params.push(name); }
    if (typeof codigo !== 'undefined') {
      const cod = codigo ? String(codigo).trim() : '';
      if (!cod) {
        const e = new Error('codigo invalido');
        e.status = 400;
        throw e;
      }
      const exists = await client.query(
        'SELECT 1 FROM productos WHERE codigo = $1 AND id <> $2 LIMIT 1',
        [cod, id]
      );
      if (exists.rowCount) {
        const e = new Error('Codigo ya existe');
        e.status = 400;
        throw e;
      }
      sets.push(`codigo = $${p++}`);
      params.push(cod);
    }
    if (typeof description !== 'undefined') { sets.push(`descripcion = $${p++}`); params.push(description || null); }
    if (typeof precio_final !== 'undefined') { sets.push(`precio_final = $${p++}`); params.push(precio_final || 0); }
    if (typeof marca !== 'undefined') { sets.push(`marca = $${p++}`); params.push(marca || null); }
    if (typeof modelo !== 'undefined') { sets.push(`modelo = $${p++}`); params.push(modelo || null); }
    if (typeof procesador !== 'undefined') { sets.push(`procesador = $${p++}`); params.push(procesador || null); }
    if (typeof ram_gb !== 'undefined') { sets.push(`ram_gb = $${p++}`); params.push(Number.isFinite(Number(ram_gb)) ? Number(ram_gb) : null); }
    if (typeof almacenamiento_gb !== 'undefined') { sets.push(`almacenamiento_gb = $${p++}`); params.push(Number.isFinite(Number(almacenamiento_gb)) ? Number(almacenamiento_gb) : null); }
    if (typeof pantalla_pulgadas !== 'undefined') { sets.push(`pantalla_pulgadas = $${p++}`); params.push(pantalla_pulgadas != null ? Number(pantalla_pulgadas) : null); }
    if (typeof camara_mp !== 'undefined') { sets.push(`camara_mp = $${p++}`); params.push(Number.isFinite(Number(camara_mp)) ? Number(camara_mp) : null); }
    if (typeof bateria_mah !== 'undefined') { sets.push(`bateria_mah = $${p++}`); params.push(Number.isFinite(Number(bateria_mah)) ? Number(bateria_mah) : null); }

    if (typeof precio_costo_pesos !== 'undefined' || typeof precio_costo_dolares !== 'undefined' || typeof tipo_cambio !== 'undefined') {
      sets.push(`precio_costo = $${p++}`);
      params.push(costoPesosFinal || 0);
      sets.push(`precio_costo_pesos = $${p++}`);
      params.push(costoPesosFinal || 0);
      sets.push(`precio_costo_dolares = $${p++}`);
      params.push(costoDolaresFinal || 0);
      sets.push(`tipo_cambio = $${p++}`);
      params.push(fx);
    }

    if (typeof margen_local !== 'undefined') {
      sets.push(`margen_local = $${p++}`);
      params.push(margenLocal);
    }
    if (typeof margen_distribuidor !== 'undefined') {
      sets.push(`margen_distribuidor = $${p++}`);
      params.push(margenDistribuidor);
    }
    if (typeof comision_pct !== 'undefined') {
      sets.push(`comision_pct = $${p++}`);
      params.push(Number(comision_pct) || 0);
    }
    if (typeof precio_modo !== 'undefined') {
      sets.push(`precio_modo = $${p++}`);
      params.push(priceMode);
    }

    const manualLocal = Number(price_local);
    const manualDistribuidor = Number(price_distribuidor);
    const hasManualLocal = Number.isFinite(manualLocal);
    const hasManualDistribuidor = Number.isFinite(manualDistribuidor);
    const hasPrice = typeof price !== 'undefined' && Number.isFinite(Number(price));

    if (priceMode === 'manual') {
      if (hasManualLocal) {
        sets.push(`precio_local = $${p++}`);
        params.push(manualLocal);
      }
      if (hasManualDistribuidor) {
        sets.push(`precio_distribuidor = $${p++}`);
        params.push(manualDistribuidor);
      }
      if (hasPrice) {
        sets.push(`precio_venta = $${p++}`);
        params.push(Number(price));
      } else if (hasManualLocal) {
        sets.push(`precio_venta = $${p++}`);
        params.push(manualLocal);
      }
    } else {
      let precioVentaFinal;
      let precioLocalFinal;
      let precioDistribuidorFinal;

      if (typeof price !== 'undefined') {
        precioVentaFinal = Number(price);
      }

      if (costoPesosFinal > 0) {
        precioLocalFinal = costoPesosFinal * (1 + margenLocal);
        precioDistribuidorFinal = costoPesosFinal * (1 + margenDistribuidor);
      } else if (typeof price !== 'undefined') {
        precioLocalFinal = precioVentaFinal;
        precioDistribuidorFinal = precioVentaFinal;
      }

      if (typeof precioLocalFinal !== 'undefined' && typeof precioVentaFinal === 'undefined') {
        precioVentaFinal = precioLocalFinal;
      }

      if (typeof precioVentaFinal !== 'undefined') {
        sets.push(`precio_venta = $${p++}`);
        params.push(precioVentaFinal);
      }
      if (typeof precioLocalFinal !== 'undefined') {
        sets.push(`precio_local = $${p++}`);
        params.push(precioLocalFinal);
      }
      if (typeof precioDistribuidorFinal !== 'undefined') {
        sets.push(`precio_distribuidor = $${p++}`);
        params.push(precioDistribuidorFinal);
      }
    }

    if (typeof proveedor_id !== 'undefined') {
      sets.push(`proveedor_id = $${p++}`);
      params.push(proveedor_id || null);
    }

    if (sets.length) {
      params.push(id);
      await client.query(`UPDATE productos SET ${sets.join(', ')}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $${p}`, params);
    }

    if (typeof stock_quantity !== 'undefined') {
      const stockQty = Math.max(0, Number(stock_quantity) || 0);
      const defaultDepId = await inv.getDefaultDepositoId(client);
      await client.query(
        `INSERT INTO inventario_depositos(producto_id, deposito_id, cantidad_disponible, cantidad_reservada)
         VALUES ($1, $2, $3, 0)
         ON DUPLICATE KEY UPDATE
           cantidad_disponible = $3,
           actualizado_en = NOW()`,
        [id, defaultDepId, stockQty]
      );
    }
    if (typeof image_url !== 'undefined') {
      if (image_url) {
        await client.query(
          `INSERT INTO producto_imagenes(producto_id, url, orden)
           VALUES ($1, $2, 0)
           ON DUPLICATE KEY UPDATE
             url = $2`,
          [id, image_url]
        );
      } else {
        await client.query('DELETE FROM producto_imagenes WHERE producto_id = $1 AND orden = 0', [id]);
      }
    }
    await catalogSync.enqueueProduct(id, client);
  });
}

async function deactivateProduct(id) {
  await query('UPDATE productos SET activo = FALSE, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  await catalogSync.enqueueProductDelete(id);
}

async function listCatalog() {
  const { rows } = await query(
    `SELECT p.id,
            p.codigo AS codigo,
            p.categoria_id AS category_id,
            p.nombre AS name,
            p.descripcion AS description,
            p.precio_venta::float AS price,
           p.precio_local::float AS price_local,
           p.precio_distribuidor::float AS price_distribuidor,
           p.comision_pct::float AS comision_pct,
           p.precio_modo AS precio_modo,
           p.precio_final::float AS precio_final,
            p.marca,
            p.modelo,
            p.procesador,
            p.ram_gb,
            p.almacenamiento_gb,
            p.pantalla_pulgadas,
             p.camara_mp,
             p.bateria_mah,
             c.nombre AS category_name,
             c.path AS category_path,
             (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden ASC, id ASC LIMIT 1) AS image_url
       FROM productos p
       JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = TRUE
        AND c.activo = TRUE
      ORDER BY c.nombre ASC, p.nombre ASC`
  );
  return rows;
}

async function listCatalogExport() {
  const { rows } = await query(
    `SELECT p.id,
            p.codigo AS codigo,
            p.categoria_id AS category_id,
            p.nombre AS name,
            p.descripcion AS description,
            p.precio_venta::float AS price,
           p.precio_local::float AS price_local,
           p.precio_distribuidor::float AS price_distribuidor,
           p.comision_pct::float AS comision_pct,
             p.precio_modo AS precio_modo,
             p.precio_final::float AS precio_final,
             c.nombre AS category_name,
             c.path AS category_path,
             (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden ASC, id ASC LIMIT 1) AS image_url
       FROM productos p
       JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = TRUE
        AND c.activo = TRUE
      ORDER BY c.nombre ASC, p.nombre ASC`
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT p.id,
            p.codigo AS codigo,
            p.categoria_id AS category_id,
            p.nombre AS name,
            p.descripcion AS description,
            p.precio_venta::float AS price,
           p.precio_local::float AS price_local,
           p.precio_distribuidor::float AS price_distribuidor,
           p.precio_modo AS precio_modo,
           p.precio_final::float AS precio_final,
            p.marca,
            p.modelo,
            p.procesador,
            p.ram_gb,
            p.almacenamiento_gb,
            p.pantalla_pulgadas,
             p.camara_mp,
             p.bateria_mah,
             c.nombre AS category_name,
             c.path AS category_path,
             (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden ASC, id ASC LIMIT 1) AS image_url
       FROM productos p
       JOIN categorias c ON c.id = p.categoria_id
      WHERE p.id = $1
        AND p.activo = TRUE
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByCodigo(codigo) {
  const cod = typeof codigo === 'string' ? codigo.trim() : '';
  if (!cod) return null;
  const { rows } = await query(
    `SELECT p.id,
            p.codigo AS codigo,
            p.categoria_id AS category_id,
            p.nombre AS name,
            p.descripcion AS description,
            p.precio_venta::float AS price,
            p.precio_costo_pesos::float AS costo_pesos,
            p.precio_costo_dolares::float AS costo_dolares,
            p.tipo_cambio::float AS tipo_cambio,
            p.margen_local::float AS margen_local,
            p.margen_distribuidor::float AS margen_distribuidor,
           p.precio_local::float AS price_local,
           p.precio_distribuidor::float AS price_distribuidor,
           p.precio_modo AS precio_modo,
           p.precio_final::float AS precio_final,
            p.marca,
            p.modelo,
            p.procesador,
            p.ram_gb,
            p.almacenamiento_gb,
            p.pantalla_pulgadas,
            p.camara_mp,
             p.bateria_mah,
             c.nombre AS category_name,
             c.path AS category_path,
             COALESCE(i.cantidad_disponible, 0) AS stock_quantity,
            (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden ASC, id ASC LIMIT 1) AS image_url
       FROM productos p
       JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN inventario i ON i.producto_id = p.id
      WHERE p.codigo = $1
        AND p.activo = TRUE
      LIMIT 1`,
    [cod]
  );
  return rows[0] || null;
}

async function findByNameCategory(name, categoryId) {
  const { rows } = await query(
    `SELECT id
       FROM productos
      WHERE LOWER(nombre) = LOWER($1)
        AND categoria_id = $2
        AND activo = TRUE
      LIMIT 1`,
    [name, categoryId]
  );
  return rows[0]?.id || null;
}

async function getProductHistory(productId, { limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const { rows } = await query(
    `SELECT ph.id,
            ph.producto_id,
            ph.proveedor_id,
            prov.nombre AS proveedor_nombre,
            ph.fecha,
            ph.costo_pesos::float AS costo_pesos,
            ph.costo_dolares::float AS costo_dolares,
            ph.tipo_cambio::float AS tipo_cambio,
            ph.margen_local::float AS margen_local,
            ph.margen_distribuidor::float AS margen_distribuidor,
            ph.precio_local::float AS precio_local,
            ph.precio_distribuidor::float AS precio_distribuidor,
            ph.usuario_id,
            u.nombre AS usuario_nombre
       FROM productos_historial ph
  LEFT JOIN proveedores prov ON prov.id = ph.proveedor_id
  LEFT JOIN usuarios u ON u.id = ph.usuario_id
      WHERE ph.producto_id = $1
      ORDER BY ph.fecha DESC, ph.id DESC
      LIMIT $2 OFFSET $3`,
    [productId, lim, off]
  );
  return rows;
}

module.exports = {
  listProducts,
  listProductsPaginated,
  listCatalog,
  listCatalogExport,
  findById,
  findByCodigo,
  findByNameCategory,
  createProduct,
  updateProduct,
  deactivateProduct,
  getProductHistory,
};
