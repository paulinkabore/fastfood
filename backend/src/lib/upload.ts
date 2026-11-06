import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { AppError } from './errors';
import { env } from '../config/env';

export const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOAD_ROOT, 'products', String(req.membership!.restaurantId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // Nom aléatoire : jamais le nom envoyé par l'utilisateur
  filename: (_req, file, cb) => cb(null, crypto.randomUUID() + EXT[file.mimetype]),
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT[file.mimetype]) {
      return cb(new AppError(400, 'INVALID_IMAGE', 'Format accepté : JPG, PNG ou WebP'));
    }
    cb(null, true);
  },
}).single('image');

export const publicImageUrl = (restaurantId: string, filename: string) =>
  `/uploads/products/${restaurantId}/${filename}`;

// Vérifie les premiers octets du fichier (signature réelle de l'image)
export async function assertImageContent(filePath: string) {
  const handle = await fs.promises.open(filePath, 'r');
  const buf = Buffer.alloc(12);
  await handle.read(buf, 0, 12, 0);
  await handle.close();

  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const webp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';

  if (!jpg && !png && !webp) {
    await fs.promises.unlink(filePath).catch(() => {});
    throw new AppError(400, 'INVALID_IMAGE', "Le fichier n'est pas une image valide");
  }
}

// Supprime une ancienne photo, sans jamais sortir du dossier uploads
export function removeImage(url?: string | null) {
  if (!url?.startsWith('/uploads/')) return;
  const file = path.resolve(UPLOAD_ROOT, url.replace('/uploads/', ''));
  if (file.startsWith(UPLOAD_ROOT + path.sep)) {
    fs.promises.unlink(file).catch(() => {});
  }
}   