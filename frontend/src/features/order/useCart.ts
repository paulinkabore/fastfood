import { useCallback, useEffect, useState } from 'react';
import type { MenuOption, MenuProduct } from '../../lib/types';
import { uuid } from '../../lib/uuid';

export type CartLine = {
  key: string;
  productId: string;
  name: string;
  basePriceFcfa: number;
  quantity: number;
  options: MenuOption[];
  notes?: string;
};

type CartState = { lines: CartLine[]; notes: string; idempotencyKey: string };

const storageKey = (token: string) => `cart:${token}`;

function load(token: string): CartState {
  try {
    const raw = localStorage.getItem(storageKey(token));
    if (raw) {
      const parsed = JSON.parse(raw) as CartState;
      if (Array.isArray(parsed.lines) && typeof parsed.idempotencyKey === 'string') return parsed;
    }
  } catch {
    /* stockage indisponible : on repart d'un panier vide */
  }
  return { lines: [], notes: '', idempotencyKey: uuid() };
}

// Prix affiché seulement : le serveur recalcule toujours le vrai prix
export const unitPrice = (l: CartLine) =>
  l.basePriceFcfa + l.options.reduce((sum, o) => sum + o.priceDeltaFcfa, 0);

export function useCart(token: string) {
  const [state, setState] = useState<CartState>(() => load(token));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(token), JSON.stringify(state));
    } catch {
      /* ignoré */
    }
  }, [token, state]);

  // Chaque modification du panier = nouvelle clé : une commande modifiée
  // n'est jamais confondue avec la précédente. En cas d'échec réseau sans
  // modification, la même clé est réutilisée : pas de doublon.
  const add = useCallback(
    (product: MenuProduct, quantity: number, options: MenuOption[], notes?: string) => {
      const cleanNotes = notes?.trim() || undefined;
      const optionKey = options.map((o) => o.id).sort().join(',');
      const key = `${product.id}|${optionKey}|${cleanNotes ?? ''}`;
      setState((s) => {
        const existing = s.lines.find((l) => l.key === key);
        const lines = existing
          ? s.lines.map((l) =>
              l.key === key ? { ...l, quantity: Math.min(20, l.quantity + quantity) } : l,
            )
          : [
              ...s.lines,
              {
                key,
                productId: product.id,
                name: product.name,
                basePriceFcfa: product.priceFcfa,
                quantity,
                options,
                notes: cleanNotes,
              },
            ];
        return { ...s, lines, idempotencyKey: uuid() };
      });
    },
    [],
  );

  const setQuantity = useCallback((key: string, quantity: number) => {
    setState((s) => ({
      ...s,
      idempotencyKey: uuid(),
      lines:
        quantity <= 0
          ? s.lines.filter((l) => l.key !== key)
          : s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, quantity) } : l)),
    }));
  }, []);

  const setNotes = useCallback(
    (notes: string) => setState((s) => ({ ...s, notes, idempotencyKey: uuid() })),
    [],
  );

  const clear = useCallback(
    () => setState({ lines: [], notes: '', idempotencyKey: uuid() }),
    [],
  );

  const count = state.lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = state.lines.reduce((sum, l) => sum + unitPrice(l) * l.quantity, 0);

  return {
    lines: state.lines,
    notes: state.notes,
    idempotencyKey: state.idempotencyKey,
    count,
    subtotal,
    add,
    setQuantity,
    setNotes,
    clear,
  };
}

export type Cart = ReturnType<typeof useCart>;