const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const GENERATED_DIR = path.join(__dirname, '..', 'public', 'generated', 'catalog-pdf');

async function ensureGeneratedDir() {
  await fsp.mkdir(GENERATED_DIR, { recursive: true });
}

function buildPublicOrigin(req) {
  const envOrigin = String(process.env.PUBLIC_ORIGIN || '').trim();
  if (envOrigin) return envOrigin.replace(/\/+$/, '');
  if (req && typeof req.protocol === 'string' && typeof req.get === 'function') {
    const host = req.get('host');
    if (host) return `${req.protocol}://${host}`.replace(/\/+$/, '');
  }
  return '';
}

async function saveCatalogPdfBuffer({ req, buffer, prefix = 'catalogo' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('Buffer PDF invalido');
  }
  await ensureGeneratedDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(6).toString('hex');
  const fileName = `${prefix}-${ts}-${rand}.pdf`;
  const fullPath = path.join(GENERATED_DIR, fileName);
  await fsp.writeFile(fullPath, buffer);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  const relativePath = `/generated/catalog-pdf/${fileName}`;
  const origin = buildPublicOrigin(req);
  const fileUrl = origin ? `${origin}${relativePath}` : relativePath;

  return {
    fileName,
    fullPath,
    fileUrl,
    relativePath,
    fileSizeBytes: buffer.length,
    checksumSha256: checksum,
  };
}

function cleanupCatalogPdfOlderThan({ hours = 72 } = {}) {
  const ttlMs = Math.max(1, Number(hours) || 72) * 60 * 60 * 1000;
  const threshold = Date.now() - ttlMs;
  if (!fs.existsSync(GENERATED_DIR)) return;
  for (const fileName of fs.readdirSync(GENERATED_DIR)) {
    const full = path.join(GENERATED_DIR, fileName);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && st.mtimeMs < threshold) {
        fs.unlinkSync(full);
      }
    } catch {
      // ignore per-file errors
    }
  }
}

function resolveCatalogPdfPath(fileName) {
  const safeName = path.basename(String(fileName || '').trim());
  if (!safeName) return null;
  const fullPath = path.join(GENERATED_DIR, safeName);
  const relative = path.relative(GENERATED_DIR, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

async function readCatalogPdfBuffer(fileName) {
  const fullPath = resolveCatalogPdfPath(fileName);
  if (!fullPath) {
    throw new Error('Archivo PDF invalido');
  }
  return fsp.readFile(fullPath);
}

module.exports = {
  saveCatalogPdfBuffer,
  cleanupCatalogPdfOlderThan,
  resolveCatalogPdfPath,
  readCatalogPdfBuffer,
};
