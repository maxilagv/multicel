const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PRIVATE_STORAGE_DIR = path.join(__dirname, '..', '..', 'storage', 'cuenta-empresa');
const LEGACY_PUBLIC_DIR = path.join(__dirname, '..', 'public', 'uploads', 'cuenta-empresa');

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function extensionFor(file) {
  const ext = path.extname(file?.originalname || '').toLowerCase();
  if (ext) return ext;
  const mime = String(file?.mimetype || '').toLowerCase();
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  return '.bin';
}

async function saveReceiptFile(file, { proveedorId, aliasCuenta }) {
  if (!file?.buffer || !file.buffer.length) {
    const error = new Error('Archivo de comprobante vacio');
    error.status = 400;
    throw error;
  }
  const now = new Date();
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const ext = extensionFor(file);
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const supplierPart = sanitizeSegment(aliasCuenta || proveedorId || 'proveedor');
  const dir = path.join(PRIVATE_STORAGE_DIR, year, month);
  const filename = `${supplierPart}-${hash.slice(0, 20)}${ext}`;
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, file.buffer);
  const relativeUrl = `/uploads/cuenta-empresa/${year}/${month}/${filename}`;
  return {
    hash,
    filename,
    mimeType: file.mimetype || null,
    sizeBytes: Number(file.size || file.buffer.length || 0),
    absolutePath,
    url: relativeUrl,
  };
}

async function resolveReceiptFilePath(storedUrl) {
  const raw = String(storedUrl || '').trim();
  if (!raw) return null;
  const relative = raw.replace(/^\/+uploads\/cuenta-empresa\/?/i, '');
  if (!relative) return null;
  const privatePath = path.join(PRIVATE_STORAGE_DIR, relative);
  try {
    await fs.access(privatePath);
    return privatePath;
  } catch {}
  const legacyPath = path.join(LEGACY_PUBLIC_DIR, relative);
  try {
    await fs.access(legacyPath);
    return legacyPath;
  } catch {}
  return null;
}

async function deleteReceiptFile(absolutePath) {
  if (!absolutePath) return;
  try {
    await fs.unlink(absolutePath);
  } catch {}
}

module.exports = {
  saveReceiptFile,
  resolveReceiptFilePath,
  deleteReceiptFile,
};
