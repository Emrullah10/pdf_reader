import multer from 'multer';
import { mkdirSync } from 'node:fs';

export const makeUploadMiddleware = ({ storageDir, maxUploadBytes }) => {
  mkdirSync(storageDir, { recursive: true });

  const storage = multer.memoryStorage();

  return multer({
    storage,
    limits: { fileSize: maxUploadBytes },
    fileFilter: (req, file, cb) => {
      cb(null, file.mimetype === 'application/pdf');
    },
  }).single('file');
};
