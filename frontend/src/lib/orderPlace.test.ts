import { describe, expect, it } from 'vitest';
import { placeLabel } from './orderPlace';

describe('lieu de la commande', () => {
  it('affiche la table quand il y en a une', () => {
    expect(placeLabel({ type: 'DINE_IN', tableLabel: 'Table 5' })).toBe('Table 5');
  });

  it('affiche le mode sinon', () => {
    expect(placeLabel({ type: 'DELIVERY', tableLabel: null })).toBe('Livraison');
    expect(placeLabel({ type: 'TAKEAWAY', tableLabel: null })).toBe('À emporter');
    expect(placeLabel({ type: 'DINE_IN', tableLabel: null })).toBe('Sur place');
  });
});
