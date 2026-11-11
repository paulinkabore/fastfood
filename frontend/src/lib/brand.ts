export const BRAND_NAME = 'RESTAURANT NJ_DISTRICT';
export const BRAND_LOGO = '/logo.png';

// Affiche le nom du restaurant sous le logo seulement s'il apporte une information en plus
export function showRestaurantName(name?: string) {
  if (!name) return false;
  return !/nj[\s_-]*district/i.test(name);
}
