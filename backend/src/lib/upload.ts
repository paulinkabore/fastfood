import multer from 'multer';
import { AppError } from './errors';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Le fichier reste en mémoire puis part dans la base : aucun disque n'est nécessaire
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!TYPES.includes(file.mimetype)) {
      return cb(new AppError(400, 'INVALID_IMAGE', 'Format accepté : JPG, PNG ou WebP'));
    }
    cb(null, true);
  },
}).single('image');

export const productImageUrl = (productId: string) =>
  `/api/v1/public/product-images/${productId}?v=${Date.now()}`;

// Vérifie les premiers octets (signature réelle de l'image) et renvoie son vrai type
export function detectImageType(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new AppError(400, 'INVALID_IMAGE', "Le fichier n'est pas une image valide");
}
