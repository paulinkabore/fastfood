import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { authRequest } from '../lib/auth';
import { fcfa } from '../lib/format';
import { unitPrice, useCart } from '../features/order/useCart';
import type {
  CashSessionView,
  MenuProduct,
  StaffCategory,
  StaffProduct,
  StaffTable,
} from '../lib/types';
import { ProductSheet } from './ProductSheet';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import { CloseIcon } from './icons';

export function CounterOrderSheet({
  restaurantId,
  session,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  session: CashSessionView | null;
  onClose: () => void;
  onCreated: (result: { orderId: string; paid: boolean }) => void;
}) {
  const cart = useCart(`counter-${restaurantId}`);
  const lock = useRef(false);

  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const [products, setProducts] = useState<StaffProduct[]>([]);
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<'DINE_IN' | 'TAKEAWAY'>('TAKEAWAY');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      authRequest<{ categories: StaffCategory[] }>(`/restaurants/${restaurantId}/categories`),
      authRequest<{ products: StaffProduct[] }>(`/restaurants/${restaurantId}/products`),
      authRequest<{ tables: StaffTable[] }>(`/restaurants/${restaurantId}/tables`),
    ])
      .then(([c, p, t]) => {
        if (cancelled) return;
        const cats = c.categories.filter((x) => x.isActive);
        setCategories(cats);
        setActiveCat(cats[0]?.id ?? null);
        setProducts(
          p.products.map((x) => ({
            ...x,
            options: x.options.filter((o) => o.isActive !== false),
          })),
        );
        setTables(t.tables.filter((x) => x.isActive));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const submit = async (payNow: boolean) => {
    if (lock.current || cart.lines.length === 0) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await authRequest<{ order: { id: string } }>(
        `/restaurants/${restaurantId}/cashier/orders`,
        {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey: cart.idempotencyKey,
            type,
            tableId: type === 'DINE_IN' && tableId ? tableId : undefined,
            notes: cart.notes.trim() || undefined,
            customerName: type === 'TAKEAWAY' ? customerName.trim() : undefined,
            items: cart.lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              optionIds: l.options.map((o) => o.id),
              notes: l.notes,
            })),
            payNow,
          }),
        },
      );
      cart.clear();
      onCreated({ orderId: data.order.id, paid: payNow });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const visible = products.filter((p) => p.categoryId === activeCat);
  const toggle = (active: boolean) =>
    `flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;

  return (
    <>
      <Sheet label="Nouvelle commande" onClose={onClose}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Nouvelle commande</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex gap-2">
            <button type="button" className={toggle(type === 'TAKEAWAY')} onClick={() => setType('TAKEAWAY')}>
              À emporter
            </button>
            <button type="button" className={toggle(type === 'DINE_IN')} onClick={() => setType('DINE_IN')}>
              Sur place
            </button>
          </div>

          {type === 'TAKEAWAY' && (
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={40}
              placeholder="Nom du client (appelé au haut-parleur)"
              aria-label="Nom du client"
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          )}

          {type === 'DINE_IN' && (
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              aria-label="Table"
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
            >
              <option value="">Sans table</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}

          {loading ? (
            <p className="animate-pulse text-center text-stone-400">Chargement du menu…</p>
          ) : (
            <>
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCat(c.id)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                      activeCat === c.id
                        ? 'bg-stone-900 text-white'
                        : 'bg-white text-stone-600 ring-1 ring-stone-200'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {visible.length === 0 && (
                  <p className="col-span-2 py-4 text-center text-sm text-stone-400">
                    Aucun produit dans cette catégorie
                  </p>
                )}
                {visible.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.isAvailable}
                    onClick={() => setSelected(p)}
                    className="rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-200/70 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    <p className="line-clamp-2 font-medium leading-tight">{p.name}</p>
                    <p className="mt-1 text-sm font-semibold text-brand-600">
                      {p.isAvailable ? fcfa(p.priceFcfa) : 'Indisponible'}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}

          {cart.lines.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-stone-700">Commande en cours</h3>
              <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
                {cart.lines.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name}</p>
                      {l.options.length > 0 && (
                        <p className="truncate text-xs text-stone-500">
                          + {l.options.map((o) => o.name).join(', ')}
                        </p>
                      )}
                      <p className="text-sm font-semibold">{fcfa(unitPrice(l) * l.quantity)}</p>
                    </div>
                    <Stepper value={l.quantity} min={0} onChange={(q) => cart.setQuantity(l.key, q)} />
                  </li>
                ))}
              </ul>
              <textarea
                value={cart.notes}
                onChange={(e) => cart.setNotes(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Remarque pour la commande (facultatif)"
                className="mt-3 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </div>
          )}

          {error && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
          )}
        </div>

        <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-stone-500">Total</span>
            <span className="text-lg font-semibold">{fcfa(cart.subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void submit(false)}
              disabled={busy || cart.lines.length === 0 || (type === 'TAKEAWAY' && customerName.trim().length < 2)}
              className="rounded-2xl bg-stone-100 px-4 py-3.5 font-semibold text-stone-800 transition active:scale-[0.98] disabled:opacity-50"
            >
              Payer plus tard
            </button>
            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={busy || cart.lines.length === 0 || !session || (type === 'TAKEAWAY' && customerName.trim().length < 2)}
              className="rounded-2xl bg-brand-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] disabled:opacity-50"
            >
              Encaisser maintenant
            </button>
          </div>
          {!session && (
            <p className="mt-2 text-center text-xs text-stone-500">
              Ouvrez votre caisse pour encaisser tout de suite.
            </p>
          )}
        </div>
      </Sheet>

      {selected && (
        <ProductSheet
          product={selected}
          onClose={() => setSelected(null)}
          onAdd={(quantity, options, notes) => {
            cart.add(selected, quantity, options, notes);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}