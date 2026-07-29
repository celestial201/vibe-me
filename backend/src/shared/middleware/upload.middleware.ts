import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const sanitizedBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${sanitizedBase}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOCX, and image files are allowed.'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max file size
});
