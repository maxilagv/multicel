const path = require('path');
const multer = require('multer');

const MAX_FILE_MB = Number(process.env.UPLOAD_MAX_MB) || 50;
const DEFAULT_ALLOWED_EXTS = new Set(['.xlsx', '.csv']);
const DEFAULT_ALLOWED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain',
]);

const storage = multer.memoryStorage();

function createUploader({
  allowedExts = DEFAULT_ALLOWED_EXTS,
  allowedMimes = DEFAULT_ALLOWED_MIMES,
  maxFileMb = MAX_FILE_MB,
  errorMessage = 'Formato de archivo no soportado. Usa .xlsx o .csv',
} = {}) {
  return multer({
    storage,
    limits: { fileSize: Number(maxFileMb || MAX_FILE_MB) * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const mime = String(file.mimetype || '').toLowerCase();
      if (allowedExts.has(ext) || allowedMimes.has(mime)) {
        cb(null, true);
        return;
      }
      cb(new Error(errorMessage));
    },
  });
}

const upload = createUploader();

function uploadSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Archivo inválido' });
      }
      return next();
    });
  };
}

function uploadSingleWithOptions(fieldName, options = {}) {
  const customUpload = createUploader(options);
  return (req, res, next) => {
    customUpload.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Archivo invalido' });
      }
      return next();
    });
  };
}

module.exports = { upload, uploadSingle, uploadSingleWithOptions };
