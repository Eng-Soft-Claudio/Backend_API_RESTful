//src/middleware/upload.js
import multer from 'multer';
import path from 'path';
import fs from 'fs'; 
import AppError from '../utils/appError.js'; 

// --- Garante que o diretório de destino exista ---
const uploadDest = path.resolve('./uploads_temp'); // Define um diretório temporário
try {
  if (!fs.existsSync(uploadDest)) {
    fs.mkdirSync(uploadDest, { recursive: true });
  }
} catch(err) {
  logger.error("[MULTER] Erro ao criar diretório temporário:", err);
}

// Configuração do armazenamento com destino explícito
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDest); // Salva no diretório temporário definido
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const finalFilename = file.fieldname + '-' + uniqueSuffix + extension;
    cb(null, finalFilename);
  }
});

// Filtro para aceitar apenas imagens
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true); // Aceita o arquivo
  } else {
    // Usa AppError para erro padronizado
    cb(new AppError(`Tipo de arquivo não suportado (${file.mimetype}). Apenas ${allowedMimes.join(', ')} são permitidos.`, 400), false);
  }
};

// Configuração do Multer
export const upload = multer({ 
  storage: storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// Log para quando o middleware 'upload.single' for usado na rota
export const logUploadMiddleware = (fieldName) => (req, res, next) => {
  next();
};