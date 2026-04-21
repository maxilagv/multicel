const { check, validationResult } = require('express-validator');
const { query } = require('../db/pg');
const configRepo = require('../db/repositories/configRepository');
const logger = require('../lib/logger');
const categoryRepo = require('../db/repositories/categoryRepository');
const productRepo = require('../db/repositories/productRepository');
const pricingRepo = require('../db/repositories/pricingRepository');
const campaignRepo = require('../db/repositories/whatsappCampaignRepository');
const ExcelJS = require('exceljs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const catalogSync = require('../services/catalogSyncService');
const { buildCatalogPdf } = require('../services/catalogPdfService');
const { saveCatalogPdfBuffer } = require('../services/catalogPdfStorageService');
const { processBatch } = require('../services/whatsappCampaignDispatcher');
const {
  getActiveProviderStatus,
} = require('../services/messaging/providerRegistry');
const { normalizePhoneToE164 } = require('../utils/whatsappPhone');

const CONFIG_KEYS = {
  name: 'catalogo_nombre',
  logoUrl: 'catalogo_logo_url',
  pdfLogoUrl: 'catalogo_pdf_logo_url',
  destacadoId: 'catalogo_destacado_producto_id',
  publicado: 'catalogo_publicado',
  priceType: 'catalogo_price_type',
  slug: 'catalogo_slug',
  domain: 'catalogo_dominio',
  publishedAt: 'catalogo_emitido_en',
};

const PRICE_LABEL_KEYS = {
  local: 'price_label_local',
  distribuidor: 'price_label_distribuidor',
  final: 'price_label_final',
};

const PRICE_LABEL_DEFAULTS = {
  local: 'Precio Distribuidor',
  distribuidor: 'Precio Mayorista',
  final: 'Precio Final',
};

function buildPriceTypes(labels) {
  return {
    distribuidor: { key: 'price_local', label: labels.local },
    mayorista: { key: 'price_distribuidor', label: labels.distribuidor },
    final: { key: 'precio_final', label: labels.final },
  };
}

async function getPriceLabels() {
  const [local, distribuidor, finalLabel] = await Promise.all([
    configRepo.getTextParam(PRICE_LABEL_KEYS.local),
    configRepo.getTextParam(PRICE_LABEL_KEYS.distribuidor),
    configRepo.getTextParam(PRICE_LABEL_KEYS.final),
  ]);
  return {
    local: local || PRICE_LABEL_DEFAULTS.local,
    distribuidor: distribuidor || PRICE_LABEL_DEFAULTS.distribuidor,
    final: finalLabel || PRICE_LABEL_DEFAULTS.final,
  };
}

function resolvePriceValue(product, priceKey) {
  const primary = Number(product?.[priceKey]);
  if (Number.isFinite(primary) && primary > 0) return primary;
  const fallback = Number(product?.price);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  const finalFallback = Number(product?.precio_final);
  if (Number.isFinite(finalFallback) && finalFallback > 0) return finalFallback;
  return 0;
}

function resolveOfferBasePriceValue(product, targetList, fallbackPriceKey) {
  const list = String(targetList || '').trim().toLowerCase();
  if (list === 'local') return resolvePriceValue(product, 'price_local');
  if (list === 'distribuidor') return resolvePriceValue(product, 'price_distribuidor');
  if (list === 'final') return resolvePriceValue(product, 'precio_final');
  return resolvePriceValue(product, fallbackPriceKey || 'precio_final');
}

function priceKeyToListCode(priceKey) {
  const key = String(priceKey || '').trim().toLowerCase();
  if (key === 'price_local') return 'local';
  if (key === 'price_distribuidor') return 'distribuidor';
  return 'final';
}

function resolveOfferBasePriceContext(product, targetList, fallbackPriceKey, labels) {
  const list = String(targetList || '').trim().toLowerCase();
  const fallbackCode = priceKeyToListCode(fallbackPriceKey);
  const listCode =
    list === 'local' || list === 'distribuidor' || list === 'final'
      ? list
      : fallbackCode;
  const listKey =
    listCode === 'local'
      ? 'price_local'
      : listCode === 'distribuidor'
      ? 'price_distribuidor'
      : 'precio_final';

  return {
    precio_base: resolveOfferBasePriceValue(product, listCode, fallbackPriceKey),
    lista_aplicada_codigo: listCode,
    lista_aplicada_label: resolvePriceListLabel(listCode, labels),
    lista_aplicada_key: listKey,
  };
}

function resolvePriceListLabel(target, labels) {
  const normalized = String(target || '').trim().toLowerCase();
  if (normalized === 'local') return labels.local;
  if (normalized === 'distribuidor') return labels.distribuidor;
  if (normalized === 'final') return labels.final;
  return 'Todas las listas';
}

function getUserId(req) {
  if (req.authUser?.id) return Number(req.authUser.id);
  if (req.user?.sub) return Number(req.user.sub);
  return null;
}

function formatTimestamp(date) {
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function normalizeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function normalizeDomain(input) {
  let raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  raw = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  raw = raw.replace(/^www\./, '');
  raw = raw.replace(/[^a-z0-9.-]/g, '').replace(/\.\.+/g, '.');
  raw = raw.replace(/^\.+|\.+$/g, '');
  if (!raw.includes('.') || raw.length > 190) return '';
  return raw;
}

function buildCatalogPublicUrl(domain) {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return '';
  return `https://${normalizedDomain}/catalogo`;
}

function fetchImageBuffer(url, redirectCount = 0) {
  if (!url) return Promise.resolve(null);
  if (redirectCount > 3) return Promise.reject(new Error('Demasiadas redirecciones'));
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error('URL invalida'));
  }
  const client = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(
      parsed,
      { timeout: 7000, headers: { 'User-Agent': 'CatalogoExcel/1.0' } },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, parsed).toString();
          fetchImageBuffer(nextUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`Estado ${status}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: res.headers['content-type'] || '',
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

function resolveImageExtension(contentType, url) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpeg';
  let ext = '';
  try {
    ext = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
  } catch {
    ext = '';
  }
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') return 'png';
  return null;
}

async function getCatalogConfig(req, res) {
  try {
    const [name, logoUrl, pdfLogoUrl, destacadoId, publicado, priceType, slug, domain] =
      await Promise.all([
      configRepo.getTextParam(CONFIG_KEYS.name),
      configRepo.getTextParam(CONFIG_KEYS.logoUrl),
      configRepo.getTextParam(CONFIG_KEYS.pdfLogoUrl),
      configRepo.getNumericParam(CONFIG_KEYS.destacadoId),
      configRepo.getNumericParam(CONFIG_KEYS.publicado),
      configRepo.getTextParam(CONFIG_KEYS.priceType),
      configRepo.getTextParam(CONFIG_KEYS.slug),
      configRepo.getTextParam(CONFIG_KEYS.domain),
      ]);

    const normalizedDomain = normalizeDomain(domain || '');

    res.json({
      nombre: name || '',
      logo_url: logoUrl || '',
      pdf_logo_url: pdfLogoUrl || '',
      destacado_producto_id: destacadoId != null ? Number(destacadoId) : null,
      publicado: publicado != null ? Number(publicado) === 1 : true,
      price_type: priceType || 'final',
      slug: normalizeSlug(slug || ''),
      dominio: normalizedDomain,
      public_url: buildCatalogPublicUrl(normalizedDomain),
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la configuracion del catalogo' });
  }
}

const validateConfig = [
  check('nombre').optional().isString().isLength({ max: 120 }),
  check('logo_url').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  check('pdf_logo_url').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  check('destacado_producto_id')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const n = Number(value);
      return Number.isInteger(n) && n > 0;
    })
    .withMessage('debe ser null o un ID de producto valido'),
  check('publicado').optional().isBoolean(),
  check('price_type').optional().isIn(['final', 'distribuidor', 'mayorista']),
  check('slug').optional().isString().isLength({ max: 64 }),
  check('dominio').optional().isString().isLength({ max: 255 }),
];

async function updateCatalogConfig(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    nombre,
    logo_url,
    pdf_logo_url,
    destacado_producto_id,
    publicado,
    price_type,
    slug,
    dominio,
  } = req.body || {};
  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub)) ? Number(req.user.sub) : null;

  try {
    if (typeof nombre !== 'undefined') {
      await configRepo.setTextParam(CONFIG_KEYS.name, String(nombre || ''), usuarioId);
    }
    if (typeof logo_url !== 'undefined') {
      await configRepo.setTextParam(CONFIG_KEYS.logoUrl, String(logo_url || ''), usuarioId);
    }
    if (typeof pdf_logo_url !== 'undefined') {
      await configRepo.setTextParam(CONFIG_KEYS.pdfLogoUrl, String(pdf_logo_url || ''), usuarioId);
    }
    if (typeof destacado_producto_id !== 'undefined') {
      if (destacado_producto_id === null || destacado_producto_id === '') {
        await configRepo.setNumericParam(CONFIG_KEYS.destacadoId, null, usuarioId);
      } else {
        const prodId = Number(destacado_producto_id);
        if (!Number.isInteger(prodId) || prodId <= 0) {
          return res.status(400).json({ error: 'ID de producto destacado invalido' });
        }
        const product = await productRepo.findById(prodId);
        if (!product) return res.status(404).json({ error: 'Producto destacado no encontrado' });
        await configRepo.setNumericParam(CONFIG_KEYS.destacadoId, prodId, usuarioId);
      }
    }
    if (typeof publicado !== 'undefined') {
      await configRepo.setNumericParam(CONFIG_KEYS.publicado, publicado ? 1 : 0, usuarioId);
    }
    if (typeof price_type !== 'undefined') {
      const normalized = String(price_type || '').toLowerCase();
      await configRepo.setTextParam(CONFIG_KEYS.priceType, normalized || 'final', usuarioId);
    }
    if (typeof slug !== 'undefined') {
      const normalizedSlug = normalizeSlug(slug);
      if (!normalizedSlug) {
        return res.status(400).json({ error: 'Slug invalido' });
      }
      await configRepo.setTextParam(CONFIG_KEYS.slug, normalizedSlug, usuarioId);
    }
    if (typeof dominio !== 'undefined') {
      const normalizedDomain = normalizeDomain(dominio);
      if (dominio && !normalizedDomain) {
        return res.status(400).json({ error: 'Dominio invalido' });
      }
      await configRepo.setTextParam(CONFIG_KEYS.domain, normalizedDomain || '', usuarioId);
    }
    await catalogSync.enqueueCatalogConfig(usuarioId);
    return getCatalogConfig(req, res);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar la configuracion del catalogo' });
  }
}

async function buildCatalogPublicData() {
  const [
    configName,
    categorias,
    productos,
    priceType,
    logoUrl,
    pdfLogoUrl,
    destacadoId,
    publicado,
    slug,
    domain,
  ] = await Promise.all([
      configRepo.getTextParam(CONFIG_KEYS.name),
      categoryRepo.getAllActive(),
      productRepo.listCatalog(),
      configRepo.getTextParam(CONFIG_KEYS.priceType),
      configRepo.getTextParam(CONFIG_KEYS.logoUrl),
      configRepo.getTextParam(CONFIG_KEYS.pdfLogoUrl),
      configRepo.getNumericParam(CONFIG_KEYS.destacadoId),
      configRepo.getNumericParam(CONFIG_KEYS.publicado),
      configRepo.getTextParam(CONFIG_KEYS.slug),
      configRepo.getTextParam(CONFIG_KEYS.domain),
    ]);

  const normalizedDomain = normalizeDomain(domain || '');

  let destacado = null;
  if (destacadoId) {
    destacado = await productRepo.findById(Number(destacadoId));
  }

  return {
    publicado: publicado != null ? Number(publicado) === 1 : true,
    slug: normalizeSlug(slug || ''),
    payload: {
      config: {
        nombre: configName || '',
        logo_url: logoUrl || '',
        pdf_logo_url: pdfLogoUrl || '',
        destacado_producto_id: destacadoId != null ? Number(destacadoId) : null,
        price_type: priceType || 'final',
        slug: normalizeSlug(slug || ''),
        dominio: normalizedDomain,
        public_url: buildCatalogPublicUrl(normalizedDomain),
      },
      destacado,
      categorias,
      productos,
    },
  };
}

async function emitCatalog(req, res) {
  const usuarioId =
    req.user?.sub && Number.isFinite(Number(req.user.sub)) ? Number(req.user.sub) : null;
  try {
    const [domain, slug] = await Promise.all([
      configRepo.getTextParam(CONFIG_KEYS.domain),
      configRepo.getTextParam(CONFIG_KEYS.slug),
    ]);
    const normalizedDomain = normalizeDomain(domain || '');
    if (!normalizedDomain) {
      return res
        .status(400)
        .json({ error: 'Configura un dominio para emitir el catalogo' });
    }

    const emittedAt = new Date().toISOString();
    await Promise.all([
      configRepo.setNumericParam(CONFIG_KEYS.publicado, 1, usuarioId),
      configRepo.setTextParam(CONFIG_KEYS.publishedAt, emittedAt, usuarioId),
      catalogSync.enqueueCatalogConfig(usuarioId),
    ]);

    return res.json({
      ok: true,
      message: 'Catalogo emitido correctamente',
      url: buildCatalogPublicUrl(normalizedDomain),
      dominio: normalizedDomain,
      slug: normalizeSlug(slug || ''),
      emitted_at: emittedAt,
    });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo emitir el catalogo' });
  }
}

async function getCatalogPublic(req, res) {
  try {
    const data = await buildCatalogPublicData();
    if (!data.publicado) {
      return res.status(404).json({ error: 'Catalogo no publicado' });
    }
    return res.json(data.payload);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo obtener el catalogo' });
  }
}

async function getCatalogPublicBySlug(req, res) {
  try {
    const requested = normalizeSlug(req.params?.slug || '');
    if (!requested) {
      return res.status(400).json({ error: 'Slug invalido' });
    }
    const data = await buildCatalogPublicData();
    if (!data.publicado) {
      return res.status(404).json({ error: 'Catalogo no publicado' });
    }
    if (!data.slug || data.slug !== requested) {
      return res.status(404).json({ error: 'Catalogo no encontrado' });
    }
    return res.json(data.payload);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo obtener el catalogo' });
  }
}

async function exportCatalogExcel(req, res) {
  const rawType = String(req.query.price_type || req.query.tipo_precio || 'final').toLowerCase();
  const labels = await getPriceLabels();
  const PRICE_TYPES = buildPriceTypes(labels);
  const priceType = PRICE_TYPES[rawType] ? rawType : 'final';
  const priceConfig = PRICE_TYPES[priceType];

  try {
    const [catalogName, products] = await Promise.all([
      configRepo.getTextParam(CONFIG_KEYS.name),
      productRepo.listCatalogExport(),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de gestion';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Catalogo', {
      views: [{ state: 'frozen', ySplit: 3 }],
      properties: { defaultRowHeight: 18 },
    });

    sheet.getColumn(1).width = 24;
    sheet.getColumn(2).width = 38;
    sheet.getColumn(3).width = 18;
    sheet.getColumn(4).width = 16;

    const title = catalogName ? `${catalogName} - Catalogo Excel` : 'Catalogo Excel';
    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = title;
    titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '111827' } };
    sheet.getRow(1).height = 28;

    sheet.mergeCells('A2:D2');
    const subtitleCell = sheet.getCell('A2');
    subtitleCell.value = `Precio: ${priceConfig.label} | Generado: ${formatTimestamp(new Date())}`;
    subtitleCell.font = { size: 10, italic: true, color: { argb: '334155' } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(2).height = 18;

    const headerRow = sheet.getRow(3);
    headerRow.values = ['Categoria', 'Producto', 'Imagen', 'Precio'];
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0EA5E9' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } },
      };
    });
    sheet.autoFilter = { from: 'A3', to: 'D3' };

    const border = {
      top: { style: 'thin', color: { argb: 'E2E8F0' } },
      left: { style: 'thin', color: { argb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
      right: { style: 'thin', color: { argb: 'E2E8F0' } },
    };

    if (!products.length) {
      const emptyRow = sheet.getRow(4);
      emptyRow.values = ['Sin categoria', 'Sin productos', 'Sin imagen', 0];
      emptyRow.eachCell((cell, col) => {
        cell.border = border;
        cell.alignment = {
          vertical: 'middle',
          horizontal: col === 4 ? 'right' : 'left',
          wrapText: false,
        };
      });
      emptyRow.getCell(4).numFmt = '"$"#,##0.00';
    } else {
      let rowIndex = 4;
      let lastCategory = null;
      for (const product of products) {
        const categoryName = product.category_name || 'Sin categoria';
        const priceValue = resolvePriceValue(product, priceConfig.key);
        const row = sheet.getRow(rowIndex);
        row.values = [categoryName, product.name || '', '', priceValue];
        row.height = 64;
        const isEven = rowIndex % 2 === 0;
        const isNewCategory = categoryName !== lastCategory;
        row.eachCell((cell, col) => {
          cell.border = {
            top: isNewCategory ? { style: 'medium', color: { argb: 'CBD5F5' } } : border.top,
            left: border.left,
            bottom: border.bottom,
            right: border.right,
          };
          cell.alignment = {
            vertical: 'middle',
            horizontal: col === 4 ? 'right' : col === 3 ? 'center' : 'left',
            wrapText: false,
          };
          if (isEven) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
          }
        });
        const categoryCell = row.getCell(1);
        categoryCell.font = { bold: true, color: { argb: '0F172A' } };
        categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        row.getCell(4).numFmt = '"$"#,##0.00';

        const imageCell = row.getCell(3);
        const imageUrl = product.image_url;
        if (imageUrl) {
          try {
            const img = await fetchImageBuffer(imageUrl);
            const ext = img ? resolveImageExtension(img.contentType, imageUrl) : null;
            if (img && ext) {
              const imageId = workbook.addImage({ buffer: img.buffer, extension: ext });
              sheet.addImage(imageId, {
                tl: { col: 2.2, row: rowIndex - 1 + 0.15 },
                ext: { width: 56, height: 56 },
              });
            } else {
              imageCell.value = 'Sin imagen';
              imageCell.font = { italic: true, color: { argb: '94A3B8' } };
            }
          } catch {
            imageCell.value = 'Sin imagen';
            imageCell.font = { italic: true, color: { argb: '94A3B8' } };
          }
        } else {
          imageCell.value = 'Sin imagen';
          imageCell.font = { italic: true, color: { argb: '94A3B8' } };
        }

        lastCategory = categoryName;
        rowIndex += 1;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `catalogo-${priceType}-${dateStamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: 'No se pudo generar el excel del catalogo' });
  }
}

async function exportCatalogPdf(req, res) {
  const rawType = String(req.query.price_type || req.query.tipo_precio || 'final').toLowerCase();
  const rawMode = String(req.query.mode || req.query.modo || 'precios').toLowerCase();
  const mode = rawMode === 'ofertas' ? 'ofertas' : 'precios';

  try {
    const generated = await generateCatalogPdfArtifact({ mode, rawType });
    const { buffer, priceType } = generated;

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename =
      mode === 'ofertas'
        ? `catalogo-ofertas-${dateStamp}.pdf`
        : `catalogo-${priceType}-${dateStamp}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo generar el PDF del catalogo' });
  }
}

async function generateCatalogPdfArtifact({ mode = 'precios', rawType = 'final' } = {}) {
  const labels = await getPriceLabels();
  const PRICE_TYPES = buildPriceTypes(labels);
  const priceType = PRICE_TYPES[rawType] ? rawType : 'final';
  const priceConfig = PRICE_TYPES[priceType];

  const [catalogName, logoUrl, pdfLogoUrl, products, offers] = await Promise.all([
    configRepo.getTextParam(CONFIG_KEYS.name),
    configRepo.getTextParam(CONFIG_KEYS.logoUrl),
    configRepo.getTextParam(CONFIG_KEYS.pdfLogoUrl),
    productRepo.listCatalogExport(),
    pricingRepo.listOffers({ incluirInactivas: false }),
  ]);

  const productsById = new Map(
    (products || []).map((product) => [Number(product.id), product])
  );
  const offersPrepared = (offers || []).map((o) => {
    const productIds = Array.from(
      new Set(
        [
          ...(Array.isArray(o.producto_ids) ? o.producto_ids : []),
          o.producto_id,
        ]
          .map((value) => Number(value))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    );

    const offerProducts = productIds
      .map((id) => productsById.get(id))
      .filter(Boolean)
      .map((product) => {
        const priceContext = resolveOfferBasePriceContext(
          product,
          o.lista_precio_objetivo,
          priceConfig.key,
          labels
        );
        const precioBase = Number(priceContext.precio_base || 0);
        const descuentoPct = Number(o.descuento_pct || 0);
        const precioOferta = Math.max(
          0,
          Number(precioBase || 0) - Number(precioBase || 0) * (descuentoPct / 100)
        );
        return {
          ...product,
          precio_base: precioBase,
          precio_oferta: precioOferta,
          lista_aplicada_codigo: priceContext.lista_aplicada_codigo,
          lista_aplicada_label: priceContext.lista_aplicada_label,
        };
      });

    return {
      ...o,
      lista_label: resolvePriceListLabel(o.lista_precio_objetivo, labels),
      producto_ids: productIds,
      offer_products: offerProducts,
    };
  });

  const generatedAt = formatTimestamp(new Date());
  const buffer = await buildCatalogPdf({
    catalogName: catalogName || 'Catalogo',
    logoUrl: pdfLogoUrl || logoUrl || '',
    mode,
    priceLabel: priceConfig.label,
    generatedAt,
    products: products || [],
    offers: offersPrepared,
    resolveProductPrice: (product) => resolvePriceValue(product, priceConfig.key),
  });

  return {
    buffer,
    mode,
    priceType,
    priceLabel: priceConfig.label,
    catalogName: catalogName || 'Catalogo',
    generatedAt,
  };
}

async function listClientsByIds(ids = []) {
  const clean = Array.from(
    new Set(
      (ids || [])
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  );
  if (!clean.length) return [];
  const start = 1;
  const marks = clean.map((_, idx) => `$${start + idx}`).join(', ');
  const { rows } = await query(
    `SELECT id,
            nombre,
            apellido,
            telefono,
            telefono_e164,
            whatsapp_opt_in,
            whatsapp_status
       FROM clientes
      WHERE id IN (${marks})
        AND estado = 'activo'`,
    clean
  );
  return rows || [];
}

const validateSendCatalogWhatsapp = [
  check('mode').optional().isIn(['precios', 'ofertas']),
  check('price_type').optional().isIn(['distribuidor', 'mayorista', 'final']),
  check('campaign_name').optional().isString().isLength({ min: 3, max: 160 }),
  check('message_text').optional().isString().isLength({ min: 1, max: 1200 }),
  check('cliente_ids').isArray({ min: 1, max: 1000 }),
  check('cliente_ids.*').isInt({ gt: 0 }),
];

async function sendCatalogWhatsappCampaign(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const rawMode = String(req.body?.mode || 'precios').toLowerCase();
  const mode = rawMode === 'ofertas' ? 'ofertas' : 'precios';
  const rawType = String(req.body?.price_type || 'final').toLowerCase();
  const clienteIds = Array.isArray(req.body?.cliente_ids) ? req.body.cliente_ids : [];
  const userId = getUserId(req);

  try {
    const providerStatus = await getActiveProviderStatus();
    if (!providerStatus?.configured) {
      return res.status(400).json({
        error: 'El proveedor de WhatsApp no esta configurado en el backend.',
      });
    }
    if (providerStatus.capabilities?.requiresConnection && providerStatus.state !== 'connected') {
      return res.status(400).json({
        error: 'WhatsApp Web no esta conectado. Vincula el canal antes de enviar la campana.',
      });
    }

    const artifact = await generateCatalogPdfArtifact({ mode, rawType });
    const storedPdf = await saveCatalogPdfBuffer({
      req,
      buffer: artifact.buffer,
      prefix: mode === 'ofertas' ? 'catalogo-ofertas' : `catalogo-${artifact.priceType}`,
    });
    if (
      providerStatus.capabilities?.supportsMediaUrl &&
      !/^https?:\/\//i.test(String(storedPdf.fileUrl || ''))
    ) {
      return res.status(400).json({
        error:
          'El proveedor activo requiere una URL publica del PDF. Configura PUBLIC_ORIGIN.',
      });
    }

    const pdfExport = await campaignRepo.createPdfExport({
      mode,
      priceType: mode === 'ofertas' ? null : artifact.priceType,
      fileName: storedPdf.fileName,
      fileUrl: storedPdf.fileUrl,
      fileSizeBytes: storedPdf.fileSizeBytes,
      checksumSha256: storedPdf.checksumSha256,
      metadata: {
        generated_at: artifact.generatedAt,
        price_label: artifact.priceLabel,
      },
      createdBy: userId,
    });

    const campaignName =
      String(req.body?.campaign_name || '').trim() ||
      `${mode === 'ofertas' ? 'Ofertas' : 'Catalogo'} ${new Date().toISOString().slice(0, 10)}`;
    const messageText =
      String(req.body?.message_text || '').trim() ||
      `Hola, te compartimos nuestro ${
        mode === 'ofertas' ? 'PDF de ofertas' : 'catalogo actualizado'
      }.`;

    const campaign = await campaignRepo.createCampaign({
      nombre: campaignName,
      descripcion:
        mode === 'ofertas'
          ? 'Campana WhatsApp con PDF de ofertas'
          : `Campana WhatsApp con PDF de catalogo (${artifact.priceLabel})`,
      pdfExportId: pdfExport?.id || null,
      pdfUrl: storedPdf.fileUrl,
      plantillaCodigo: 'catalogo_pdf',
      mensajeTexto: messageText,
      metadata: {
        mode,
        price_type: mode === 'ofertas' ? null : artifact.priceType,
        selected_client_count: clienteIds.length,
        provider: providerStatus.provider || 'unknown',
      },
      createdBy: userId,
    });

    const clients = await listClientsByIds(clienteIds);
    const byId = new Map(clients.map((c) => [Number(c.id), c]));
    const recipientsPayload = [];
    const skipped = [];

    for (const rawId of clienteIds) {
      const id = Number(rawId);
      const client = byId.get(id);
      if (!client) {
        skipped.push({ cliente_id: id, reason: 'Cliente no encontrado o inactivo' });
        continue;
      }
      const normalized = client.telefono_e164 || normalizePhoneToE164(client.telefono);
      if (!normalized) {
        recipientsPayload.push({
          cliente_id: id,
          destino_input: client.telefono || null,
          destino_e164: null,
          estado: 'failed',
          metadata: { reason: 'Telefono invalido o ausente' },
        });
        continue;
      }
      recipientsPayload.push({
        cliente_id: id,
        destino_input: client.telefono || normalized,
        destino_e164: normalized,
        estado: 'pending',
        metadata: {
          cliente: `${client.nombre || ''} ${client.apellido || ''}`.trim(),
          whatsapp_opt_in: Number(client.whatsapp_opt_in || 0) === 1,
          whatsapp_status: client.whatsapp_status || 'unknown',
        },
      });
    }

    await campaignRepo.addCampaignRecipients(campaign.id, recipientsPayload);
    await campaignRepo.setCampaignStatus(campaign.id, 'queued');
    processBatch({ batchSize: 50 }).catch(() => {});

    const summary = await campaignRepo.getCampaignStatusSummary(campaign.id);
    res.status(201).json({
      campaign_id: campaign.id,
      pdf_url: storedPdf.fileUrl,
      mode,
      price_type: mode === 'ofertas' ? null : artifact.priceType,
      summary,
      skipped,
    });
  } catch (e) {
    logger.error({ err: e }, '[catalogo] sendCatalogWhatsappCampaign error');
    res.status(500).json({ error: e.message || 'No se pudo enviar la campana de WhatsApp' });
  }
}

async function listCatalogWhatsappCampaigns(req, res) {
  try {
    const rows = await campaignRepo.listCampaigns({
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron obtener campanas de WhatsApp' });
  }
}

async function getCatalogWhatsappCampaign(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });
  try {
    const out = await campaignRepo.getCampaignDetail(id);
    if (!out) return res.status(404).json({ error: 'Campana no encontrada' });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener la campana de WhatsApp' });
  }
}

module.exports = {
  getCatalogConfig,
  updateCatalogConfig: [...validateConfig, updateCatalogConfig],
  emitCatalog,
  getCatalogPublic,
  getCatalogPublicBySlug,
  exportCatalogExcel,
  exportCatalogPdf,
  sendCatalogWhatsappCampaign: [...validateSendCatalogWhatsapp, sendCatalogWhatsappCampaign],
  listCatalogWhatsappCampaigns,
  getCatalogWhatsappCampaign,
};
