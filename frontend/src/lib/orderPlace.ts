type Place = { type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'; tableLabel: string | null };

// Où va la commande : sa table, ou son mode (livraison, à emporter, sur place)
export const placeLabel = (o: Place) =>
  o.tableLabel ?? (o.type === 'DELIVERY' ? 'Livraison' : o.type === 'TAKEAWAY' ? 'À emporter' : 'Sur place');
