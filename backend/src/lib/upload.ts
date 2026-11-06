import multer from 'multer';
import crypto from 'crypto';
import { put, del } from '@vercel/blob';
import { AppError } from './errors';

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT[file.mimetype]) {
      return cb(new AppError(400, 'INVALID_IMAGE', 'Format accepté : JPG, PNG ou WebP'));
    }
    cb(null, true);
  },
}).single('image');

// Vérifie les premiers octets du fichier (signature réelle de l'image).
export async function assertImageContent(buffer: Buffer) {
  const jpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const webp = buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';

  if (!jpg && !png && !webp) {
    throw new AppError(400, 'INVALID_IMAGE', "Le fichier n'est pas une image valide");
  }
}

// Les photos sont stockées durablement dans Vercel Blob, jamais sur le disque éphémère d'une Function.
export async function saveProductImage(restaurantId: string, buffer: Buffer, contentType: string) {
  const extension = EXT[contentType];
  if (!extension) throw new AppError(400, 'INVALID_IMAGE', 'Format accepté : JPG, PNG ou WebP');

  return put(`products/${restaurantId}/${crypto.randomUUID()}${extension}`, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
  });
}

// Les URLs Blob sont publiques et uniques. On ne supprime que les URLs du domaine Blob.
export async function removeImage(url?: string | null) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('.public.blob.vercel-storage.com')) return;
    await del(url);
  } catch {
    // Une suppression d'image ne doit pas faire échouer la modification du produit.
  }
}
