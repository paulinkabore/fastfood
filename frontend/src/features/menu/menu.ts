export type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number };
};

export type OptionRow = {
  id: string;
  name: string;
  priceDeltaFcfa: number;
  isActive: boolean;
};

export type ProductRow = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceFcfa: number;
  imageUrl: string | null;
  allergens: string[];
  isAvailable: boolean;
  sortOrder: number;
  options: OptionRow[];
};

// Les catégories voulues pour le restaurant
export const SUGGESTED_CATEGORIES = [
  'Plats africains',
  'Fast-food',
  "Gâteaux d'anniversaire",
  'Boissons',
  'Jus',
];

// Compare deux noms sans tenir compte des accents, des majuscules ni de la ponctuation
export const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');