export type AdminRestaurant = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { memberships: number; tables: number; products: number };
};

export type ManagerRow = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
};

// Nom indiqué au début du projet : proposé d'un clic, jamais imposé
export const SUGGESTED_NAME = 'NJ DISTRICT';

// Sans caractères ambigus (0/O, 1/l/I) pour éviter les erreurs de recopie
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%&*';

// Mot de passe aléatoire fabriqué par le navigateur (générateur sécurisé)
export function generatePassword(length = 14): string {
  const limit = 256 - (256 % ALPHABET.length);
  const out: string[] = [];
  while (out.length < length) {
    const buf = new Uint8Array(length * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && out.length < length) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join('');
}