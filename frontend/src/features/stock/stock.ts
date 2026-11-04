export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
  quantity: number;
  alertThreshold: number;
  isLow: boolean;
  isOut: boolean;
};

export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'LOSS' | 'CORRECTION';

export type Movement = {
  id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  orderNumber: number | null;
  byName: string | null;
  createdAt: string;
};

export type RecipeLine = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantityPerUnit: number;
};

export type RecipeRow = { productId: string; lines: RecipeLine[] };

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });

export const qty = (n: number) => nf.format(n).replace(/\s/g, '\u00a0');
export const withUnit = (n: number, unit: string) => `${qty(n)}\u00a0${unit}`;

export const UNITS = ['kg', 'g', 'L', 'mL', 'pièce', 'sachet', 'boîte'];

// Accepte la virgule française : « 1,5 » devient 1.5
export const parseDecimal = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

// Quantité valide : nombre positif (ou nul si autorisé), trois décimales au maximum
export const validQty = (v: number, allowZero = false) =>
  Number.isFinite(v) &&
  (allowZero ? v >= 0 : v > 0) &&
  v <= 1_000_000 &&
  Math.abs(Math.round(v * 1000) / 1000 - v) < 1e-9;

export const MOVEMENT_LABEL: Record<MovementType, { label: string; style: string }> = {
  IN: { label: 'Entrée', style: 'bg-emerald-50 text-emerald-700' },
  OUT: { label: 'Commande', style: 'bg-sky-50 text-sky-700' },
  ADJUSTMENT: { label: 'Inventaire', style: 'bg-violet-50 text-violet-700' },
  LOSS: { label: 'Perte', style: 'bg-red-50 text-red-700' },
  CORRECTION: { label: 'Correction', style: 'bg-amber-50 text-amber-700' },
};