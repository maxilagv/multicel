const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');

const MAX_FILE_MB = Number(process.env.BACKUP_UPLOAD_MAX_MB) || 1024;
const ALLOWED_EXTS = new Set(['.sqlite', '.db']);
const ALLOWED_MIMES = new Set([
  'application/x-sqlite3',
  'application/vnd.sqlite3',
  'application/octet-stream',
]);

const uploadDir = path.join(os.tmpdir(), 'sg-backup-uploads');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureDir(uploadDir);
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXTS.has(ext) ? ext : '.sqlite';
    const id = Math.random().toString(36).slice(2, 8);
    cb(null, `restore_${Date.now()}_${id}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXTS.has(ext) || ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Formato de archivo no soportado. Usa .sqlite o .db'));
  },
});

function uploadBackupSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Archivo invalido' });
      }
      return next();
    });
  };
}

module.exports = { uploadBackupSingle };
