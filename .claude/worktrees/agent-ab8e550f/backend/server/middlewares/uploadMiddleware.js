const path = require('path');
const multer = require('multer');

const MAX_FILE_MB = Number(process.env.UPLOAD_MAX_MB) || 50;
const ALLOWED_EXTS = new Set(['.xlsx', '.csv']);
const ALLOWED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain',
]);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXTS.has(ext) || ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Formato de archivo no soportado. Usa .xlsx o .csv'));
  },
});

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

module.exports = { upload, uploadSingle };
