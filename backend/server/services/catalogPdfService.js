const PDFDocument = require('pdfkit');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

function formatMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `$ ${n.toFixed(2)}` : '$ 0.00';
}

function normalizeText(value, fallback = '-') {
  const t = String(value == null ? '' : value).trim();
  return t || fallback;
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
      { timeout: 7000, headers: { 'User-Agent': 'CatalogoPDF/1.0' } },
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

async function resolveRemoteImage(cache, url) {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);
  try {
    const img = await fetchImageBuffer(url);
    const extension = img ? resolveImageExtension(img.contentType, url) : null;
    if (!img || !extension) {
      cache.set(url, null);
      return null;
    }
    const out = { buffer: img.buffer, extension };
    cache.set(url, out);
    return out;
  } catch {
    cache.set(url, null);
    return null;
  }
}

function drawPlaceholderImage(doc, x, y, width, height, label = 'Sin imagen') {
  doc.roundedRect(x, y, width, height, 6).fillAndStroke('#F1F5F9', '#CBD5E1');
  doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(label, x, y + height / 2 - 4, {
    width,
    align: 'center',
  });
}

function drawTopHeader(doc, { catalogName, title, subtitle }) {
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.roundedRect(x, y, width, 54, 10).fill('#0F172A');
  doc.fillColor('#F8FAFC').font('Helvetica-Bold').fontSize(14).text(catalogName, x + 14, y + 10, {
    width: width - 28,
  });
  doc.fillColor('#CBD5E1').font('Helvetica').fontSize(10).text(title, x + 14, y + 28, {
    width: width - 28,
  });
  doc.fillColor('#94A3B8').font('Helvetica').fontSize(8.5).text(subtitle, x + 14, y + 41, {
    width: width - 28,
  });
  doc.moveDown(4.2);
}

function ensureSpace(doc, requiredHeight, onNewPage) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight <= bottom) return;
  doc.addPage();
  if (typeof onNewPage === 'function') onNewPage();
}

async function drawCover(doc, imageCache, { catalogName, logoUrl, modeLabel, generatedAt, badge }) {
  const x = doc.page.margins.left;
  const y = doc.page.margins.top;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const height = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

  doc.rect(x, y, width, height).fill('#020617');
  doc.circle(x + width - 70, y + 70, 90).fill('#0EA5E955');
  doc.circle(x + 70, y + height - 70, 80).fill('#14B8A655');
  doc.roundedRect(x + 24, y + 24, width - 48, height - 48, 18).fill('#0F172AE0');

  doc.fillColor('#E2E8F0').font('Helvetica').fontSize(10).text(generatedAt, x + 44, y + 52);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(30).text(catalogName, x + 44, y + 80, {
    width: width - 88,
  });
  doc.fillColor('#38BDF8').font('Helvetica-Bold').fontSize(16).text(modeLabel, x + 44, y + 132, {
    width: width - 88,
  });
  doc.fillColor('#CBD5E1').font('Helvetica').fontSize(11).text(
    'Documento comercial generado desde el panel de catalogo.',
    x + 44,
    y + 156,
    { width: width - 88 }
  );

  doc.roundedRect(x + 44, y + 188, 220, 28, 12).fill('#111827');
  doc.fillColor('#A5F3FC').font('Helvetica-Bold').fontSize(10).text(badge, x + 58, y + 197);

  const logoImage = await resolveRemoteImage(imageCache, logoUrl);
  const logoX = x + width - 190;
  const logoY = y + 160;
  if (logoImage) {
    doc.roundedRect(logoX, logoY, 130, 130, 14).fill('#FFFFFF');
    doc.image(logoImage.buffer, logoX + 8, logoY + 8, { fit: [114, 114], align: 'center', valign: 'center' });
  } else {
    drawPlaceholderImage(doc, logoX, logoY, 130, 130, 'Sin logo');
  }

  doc.addPage();
}

async function drawProductRows(doc, imageCache, products, context) {
  const rowHeight = 72;
  const tableX = doc.page.margins.left;
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let lastCategory = null;

  const drawSectionHeader = () => {
    drawTopHeader(doc, {
      catalogName: context.catalogName,
      title: `Catalogo de productos - ${context.priceLabel}`,
      subtitle: `Generado: ${context.generatedAt}`,
    });
  };

  drawSectionHeader();

  for (const product of products) {
    const category = normalizeText(product.category_name, 'Sin categoria');
    if (category !== lastCategory) {
      ensureSpace(doc, 28 + rowHeight, drawSectionHeader);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(12).text(category, tableX, doc.y);
      doc.moveTo(tableX, doc.y + 2).lineTo(tableX + tableWidth, doc.y + 2).strokeColor('#CBD5E1').stroke();
      doc.moveDown(0.7);
      lastCategory = category;
    }

    ensureSpace(doc, rowHeight + 6, drawSectionHeader);
    const y = doc.y;
    doc.roundedRect(tableX, y, tableWidth, rowHeight, 10).fillAndStroke('#FFFFFF', '#E2E8F0');

    const imageBox = { x: tableX + 8, y: y + 8, width: 56, height: 56 };
    const remoteImage = await resolveRemoteImage(imageCache, product.image_url);
    if (remoteImage) {
      doc.roundedRect(imageBox.x, imageBox.y, imageBox.width, imageBox.height, 8).fill('#F8FAFC');
      doc.image(remoteImage.buffer, imageBox.x + 2, imageBox.y + 2, {
        fit: [imageBox.width - 4, imageBox.height - 4],
        align: 'center',
        valign: 'center',
      });
    } else {
      drawPlaceholderImage(doc, imageBox.x, imageBox.y, imageBox.width, imageBox.height);
    }

    const textX = imageBox.x + imageBox.width + 10;
    const rightX = tableX + tableWidth - 12;
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text(normalizeText(product.name), textX, y + 10, {
      width: tableWidth - 180,
    });
    doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text(
      `Codigo: ${normalizeText(product.codigo, '-')}`,
      textX,
      y + 28,
      { width: tableWidth - 180 }
    );
    doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text(
      normalizeText(product.description, 'Sin descripcion'),
      textX,
      y + 41,
      { width: tableWidth - 180, ellipsis: true }
    );

    const price = context.resolveProductPrice(product);
    doc.fillColor('#0EA5E9').font('Helvetica-Bold').fontSize(13).text(formatMoney(price), rightX - 110, y + 22, {
      width: 110,
      align: 'right',
    });

    doc.y = y + rowHeight + 6;
  }
}

function offerRuleLabel(offer) {
  if (String(offer.tipo_oferta || '') === 'cantidad') {
    return `Minimo ${Number(offer.cantidad_minima || 1)} unidades`;
  }
  const from = offer.fecha_desde ? String(offer.fecha_desde).slice(0, 10) : '-';
  const to = offer.fecha_hasta ? String(offer.fecha_hasta).slice(0, 10) : '-';
  return `${from} a ${to}`;
}

function drawStrikethroughText(doc, text, x, y, width, align = 'right') {
  const label = String(text || '').trim();
  if (!label) return;
  doc.fillColor('#FCA5A5').font('Helvetica-Bold').fontSize(9.2).text(label, x, y, {
    width,
    align,
  });
  const measuredWidth = doc.widthOfString(label);
  const startX =
    align === 'center'
      ? x + Math.max(0, (width - measuredWidth) / 2)
      : align === 'right'
      ? x + Math.max(0, width - measuredWidth)
      : x;
  const lineY = y + 5;
  doc.save();
  doc.lineWidth(1.2);
  doc.strokeColor('#EF4444');
  doc.moveTo(startX, lineY).lineTo(startX + measuredWidth, lineY).stroke();
  doc.restore();
}

function resolveOfferHeroImageUrl(offer, offerProducts = []) {
  const offerImage = String(offer?.packaging_image_url || '').trim();
  if (offerImage) return offerImage;
  for (const product of offerProducts) {
    const productImage = String(product?.image_url || '').trim();
    if (productImage) return productImage;
  }
  return null;
}

async function drawOfferRows(doc, imageCache, offers, context) {
  const headerHeight = 74;
  const rowHeight = 66;
  const tableX = doc.page.margins.left;
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const drawSectionHeader = () => {
    drawTopHeader(doc, {
      catalogName: context.catalogName,
      title: 'Catalogo de ofertas activas',
      subtitle: `Generado: ${context.generatedAt}`,
    });
  };

  drawSectionHeader();

  for (const offer of offers) {
    const offerProducts = Array.isArray(offer.offer_products) ? offer.offer_products : [];
    const heroUrl = resolveOfferHeroImageUrl(offer, offerProducts);
    const heroImage = await resolveRemoteImage(imageCache, heroUrl);
    const estimatedRows = offerProducts.length || 1;
    ensureSpace(doc, headerHeight + estimatedRows * (rowHeight + 6) + 10, drawSectionHeader);

    const headerY = doc.y;
    doc.roundedRect(tableX, headerY, tableWidth, headerHeight, 10).fill('#0F172A');
    const targetListLabel = normalizeText(offer.lista_label, offer.lista_precio_objetivo);
    const extraListContext =
      String(offer.lista_precio_objetivo || '').trim().toLowerCase() === 'todas'
        ? ` | En este PDF se calcula sobre: ${normalizeText(context.priceLabel, 'Precio Final')}`
        : '';
    doc.fillColor('#E2E8F0').font('Helvetica-Bold').fontSize(11).text(normalizeText(offer.nombre), tableX + 12, headerY + 9, {
      width: tableWidth - 276,
    });
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(8.2).text(
      `Regla: ${offerRuleLabel(offer)} | Lista objetivo: ${targetListLabel}${extraListContext}`,
      tableX + 12,
      headerY + 25,
      { width: tableWidth - 276 }
    );
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(8.2).text(
      normalizeText(offer.descripcion, 'Sin descripcion'),
      tableX + 12,
      headerY + 40,
      { width: tableWidth - 276, ellipsis: true }
    );

    const discountX = tableX + tableWidth - 202;
    const discountY = headerY + 18;
    doc.roundedRect(discountX, discountY, 88, 34, 8).fill('#111827');
    doc.fillColor('#67E8F9').font('Helvetica-Bold').fontSize(8).text('Descuento', discountX + 6, discountY + 6, {
      width: 76,
      align: 'center',
    });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text(
      `${Number(offer.descuento_pct || 0).toFixed(2)}%`,
      discountX + 6,
      discountY + 16,
      { width: 76, align: 'center' }
    );

    const heroBox = { x: tableX + tableWidth - 106, y: headerY + 10, width: 58, height: 58 };
    if (heroImage) {
      doc.roundedRect(heroBox.x, heroBox.y, heroBox.width, heroBox.height, 8).fill('#FFFFFF');
      doc.image(heroImage.buffer, heroBox.x + 3, heroBox.y + 3, {
        fit: [heroBox.width - 6, heroBox.height - 6],
        align: 'center',
        valign: 'center',
      });
    } else {
      drawPlaceholderImage(doc, heroBox.x, heroBox.y, heroBox.width, heroBox.height, 'Oferta');
    }
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(7).text('Imagen oferta', heroBox.x, heroBox.y + heroBox.height + 1, {
      width: heroBox.width,
      align: 'center',
    });

    doc.y = headerY + headerHeight + 6;

    if (!offerProducts.length) {
      ensureSpace(doc, rowHeight + 6, drawSectionHeader);
      const y = doc.y;
      doc.roundedRect(tableX, y, tableWidth, rowHeight, 8).fillAndStroke('#FFFFFF', '#E2E8F0');
      doc.fillColor('#64748B').font('Helvetica').fontSize(9).text(
        'Oferta sin productos seleccionados (aplica a todos los productos).',
        tableX + 12,
        y + 26,
        { width: tableWidth - 24 }
      );
      doc.y = y + rowHeight + 8;
      continue;
    }

    for (const product of offerProducts) {
      ensureSpace(doc, rowHeight + 6, drawSectionHeader);
      const y = doc.y;
      doc.roundedRect(tableX, y, tableWidth, rowHeight, 8).fillAndStroke('#FFFFFF', '#E2E8F0');

      const imageBox = { x: tableX + 8, y: y + 8, width: 48, height: 48 };
      const remoteImage = await resolveRemoteImage(imageCache, product.image_url);
      if (remoteImage) {
        doc.roundedRect(imageBox.x, imageBox.y, imageBox.width, imageBox.height, 6).fill('#F8FAFC');
        doc.image(remoteImage.buffer, imageBox.x + 2, imageBox.y + 2, {
          fit: [imageBox.width - 4, imageBox.height - 4],
          align: 'center',
          valign: 'center',
        });
      } else {
        drawPlaceholderImage(doc, imageBox.x, imageBox.y, imageBox.width, imageBox.height);
      }

      const textX = imageBox.x + imageBox.width + 10;
      const rightX = tableX + tableWidth - 12;
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10).text(normalizeText(product.name), textX, y + 10, {
        width: tableWidth - 208,
      });
      doc.fillColor('#64748B').font('Helvetica').fontSize(8.3).text(
        `Codigo: ${normalizeText(product.codigo, '-')}`,
        textX,
        y + 28,
        { width: tableWidth - 220 }
      );
      doc.fillColor('#64748B').font('Helvetica').fontSize(8.1).text(
        `Aplica sobre: ${normalizeText(product.lista_aplicada_label, targetListLabel)}`,
        textX,
        y + 41,
        { width: tableWidth - 220 }
      );

      const priceX = rightX - 126;
      const priceWidth = 126;
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5).text('Antes', priceX, y + 2, {
        width: priceWidth,
        align: 'right',
      });
      drawStrikethroughText(
        doc,
        formatMoney(product.precio_base),
        priceX,
        y + 12,
        priceWidth,
        'right'
      );
      doc.fillColor('#67E8F9').font('Helvetica-Bold').fontSize(7.8).text('Ahora', priceX, y + 22, {
        width: priceWidth,
        align: 'right',
      });
      doc.fillColor('#0EA5E9').font('Helvetica-Bold').fontSize(12).text(
        formatMoney(product.precio_oferta),
        priceX,
        y + 31,
        { width: priceWidth, align: 'right' }
      );
      doc.fillColor('#22C55E').font('Helvetica-Bold').fontSize(8).text(
        `${Number(offer.descuento_pct || 0).toFixed(2)}% OFF`,
        priceX,
        y + 47,
        { width: priceWidth, align: 'right' }
      );

      doc.y = y + rowHeight + 6;
    }
  }
}

async function buildCatalogPdf({
  catalogName = 'Catalogo',
  logoUrl = '',
  mode = 'precios',
  priceLabel = 'Precio',
  generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' '),
  products = [],
  offers = [],
  resolveProductPrice = () => 0,
} = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const chunks = [];
  const imageCache = new Map();
  doc.on('data', (chunk) => chunks.push(chunk));

  const modeLabel = mode === 'ofertas' ? 'Listado de ofertas' : `Lista de precios (${priceLabel})`;
  await drawCover(doc, imageCache, {
    catalogName,
    logoUrl,
    modeLabel,
    generatedAt,
    badge: mode === 'ofertas' ? 'Modo ofertas' : 'Modo precios',
  });

  if (mode === 'ofertas') {
    await drawOfferRows(doc, imageCache, offers, { catalogName, generatedAt, priceLabel });
  } else {
    await drawProductRows(doc, imageCache, products, {
      catalogName,
      generatedAt,
      priceLabel,
      resolveProductPrice,
    });
  }

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = {
  buildCatalogPdf,
};
