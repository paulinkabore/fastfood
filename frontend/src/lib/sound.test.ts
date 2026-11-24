import { describe, expect, it } from 'vitest';
import { readyAnnouncement, speakableName } from './sound';

describe('annonce vocale', () => {
  it('dit la commande de la table suivie de son numéro', () => {
    expect(readyAnnouncement({ number: 12, type: 'DINE_IN', tableLabel: 'Table 5' })).toBe(
      'La commande de la table 5 est prête',
    );
  });

  it('accepte un libellé qui n’est que le numéro', () => {
    expect(readyAnnouncement({ number: 12, type: 'DINE_IN', tableLabel: '7' })).toBe(
      'La commande de la table 7 est prête',
    );
  });

  it('sans table, précise le mode', () => {
    expect(readyAnnouncement({ number: 3, type: 'TAKEAWAY', tableLabel: null })).toBe(
      'La commande à emporter numéro 3 est prête',
    );
    expect(readyAnnouncement({ number: 4, type: 'DELIVERY', tableLabel: null })).toBe(
      'La commande de livraison numéro 4 est prête',
    );
  });

  it('ne fait pas épeler un nom écrit en majuscules', () => {
    expect(speakableName('KABORE PAULIN')).toBe('Kabore Paulin');
    expect(speakableName('  jean-marc  ouedraogo ')).toBe('Jean-Marc Ouedraogo');
    expect(speakableName("N'DIAYE")).toBe("N'Diaye");
    expect(readyAnnouncement({ number: 5, type: 'TAKEAWAY', tableLabel: null, customerName: 'KABORE' })).toBe(
      'La commande de Kabore est prête',
    );
  });
});
