import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../lib/api';
import { authRequest } from '../lib/auth';
import { BRAND_NAME } from '../lib/brand';
import { fcfa, parseAmount } from '../lib/format';
import { unitPrice, useCart } from '../features/order/useCart';
import type {
  CashSessionView,
  MenuProduct,
  OrderView,
  StaffCategory,
  StaffProduct,
  StaffTable,
} from '../lib/types';
import { ChangeVoucherPanel, useVoucher } from './ChangeVoucherPanel';
import { Logo } from './Logo';
import { ProductSheet } from './ProductSheet';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import { BagIcon, CloseIcon, MinusIcon, PlusIcon } from './icons';

export type CounterResult = {
  orderId: string;
  paid: boolean;
  order: OrderView;
  // Bon de monnaie imprimé directement depuis la prise de commande
  voucher: { amountFcfa: number; code: string | null } | null;
};

const BILLS = [1000, 2000, 5000, 10000];

function Thumb({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img src={url} alt={name} loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
  ) : (
    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 text-2xl font-semibold text-brand-600">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

const inputCls =
  'w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100';

export function CounterOrderSheet({
  restaurantId,
  session,
  onClose,
  onCreated,
  mode = 'cashier',
}: {
  restaurantId: string;
  mode?: 'cashier' | 'waiter';
  session: CashSessionView | null;
  onClose: () => void;
  onCreated: (result: CounterResult) => void;
}) {
  const cart = useCart(`counter-${restaurantId}`);
  const lock = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const [products, setProducts] = useState<StaffProduct[]>([]);
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const waiter = mode === 'waiter';
  const [type, setType] = useState<'DINE_IN' | 'TAKEAWAY'>(waiter ? 'DINE_IN' : 'TAKEAWAY');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  // Étape « nom du client » (à emporter) avant l'encaissement ou l'enregistrement
  const [askName, setAskName] = useState<null | 'pay' | 'later'>(null);
  const [received, setReceived] = useState('');
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

  // Bloque le défilement de la page derrière et ferme avec Échap
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selected && !cartOpen) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, selected, cartOpen]);

  // Met en évidence la catégorie visible pendant le défilement
  useEffect(() => {
    if (loading || !scroller.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveCat(top.target.id.replace('ccat-', ''));
      },
      { root: scroller.current, rootMargin: '-140px 0px -65% 0px' },
    );
    categories.forEach((c) => {
      const el = document.getElementById(`ccat-${c.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [loading, categories, products]);

  const inCart = useCallback(
    (productId: string) =>
      cart.lines.filter((l) => l.productId === productId).reduce((n, l) => n + l.quantity, 0),
    [cart.lines],
  );

  useEffect(() => {
    if (cart.count === 0) {
      setCartOpen(false);
      setPaying(false);
      setAskName(null);
    }
  }, [cart.count]);

  const needName = type === 'TAKEAWAY' && customerName.trim().length < 2;
  const needTable = waiter && !tableId;
  const total = cart.subtotal;
  const amount = parseAmount(received);
  const change = amount - total;
  const validAmount = amount >= total;

  const submit = async (payNow: boolean, opts?: { amountReceivedFcfa: number; voucherFcfa?: number }) => {
    if (lock.current || cart.lines.length === 0) return;
    if (needTable) return setError('Choisissez la table');
    if (needName) return setError('Saisissez le nom du client');
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await authRequest<{
        order: OrderView;
        payment?: { changeCode: string | null; changeDueFcfa: number } | null;
      }>(`/restaurants/${restaurantId}/${waiter ? 'waiter' : 'cashier'}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: cart.idempotencyKey,
          ...(waiter ? {} : { type }),
          tableId: type === 'DINE_IN' && tableId ? tableId : undefined,
          customerName: type === 'TAKEAWAY' ? customerName.trim() : undefined,
          items: cart.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            optionIds: l.options.map((o) => o.id),
            notes: l.notes,
          })),
          ...(waiter ? {} : { payNow, ...(payNow && opts ? opts : {}) }),
        }),
      });
      cart.clear();
      const due = data.payment?.changeDueFcfa ?? 0;
      onCreated({
        orderId: data.order.id,
        paid: payNow,
        order: data.order,
        voucher:
          opts?.voucherFcfa && due > 0
            ? { amountFcfa: due, code: data.payment?.changeCode ?? null }
            : null,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const toggle = (active: boolean) =>
    `flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;

  const addOne = (p: StaffProduct) => {
    if (p.options.length > 0) setSelected(p);
    else cart.add(p, 1, [], '');
  };
  const removeOne = (p: StaffProduct) => {
    const l = cart.lines.find((x) => x.productId === p.id);
    if (l) cart.setQuantity(l.key, l.quantity - 1);
  };

  const visibleCats = categories.filter((c) => products.some((p) => p.categoryId === c.id));
  const voucher = useVoucher(Math.max(0, change));
  const quick = [total, ...BILLS.filter((b) => b > total)];

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-stone-50 print:hidden" role="dialog" aria-label="Nouvelle commande">
      <div ref={scroller} className="relative flex-1 overflow-y-auto pb-32">
        <header className="bg-gradient-to-b from-brand-50 to-stone-50 px-4 pb-4 pt-5">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Logo className="h-12" />
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">{BRAND_NAME}</h1>
                  <p className="text-sm text-stone-500">Nouvelle commande</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="grid h-10 w-10 place-items-center rounded-full bg-white text-stone-600 shadow-sm ring-1 ring-stone-200/70"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70">
              {!waiter && (
                <div className="flex gap-2">
                  <button type="button" className={toggle(type === 'TAKEAWAY')} onClick={() => setType('TAKEAWAY')}>
                    À emporter
                  </button>
                  <button type="button" className={toggle(type === 'DINE_IN')} onClick={() => setType('DINE_IN')}>
                    Sur place
                  </button>
                </div>
              )}
              {type === 'DINE_IN' && (
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  aria-label="Table"
                  className={inputCls}
                >
                  <option value="">{waiter ? 'Choisir la table…' : 'Sans table'}</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
              {type === 'TAKEAWAY' && (
                <p className="px-1 text-sm text-stone-500">
                  Commande à emporter : le nom du client est demandé avant l’encaissement.
                </p>
              )}
            </div>
          </div>
        </header>

        {loading ? (
          <div className="mx-auto max-w-3xl space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-stone-200/60" />
            ))}
          </div>
        ) : visibleCats.length === 0 ? (
          <p className="px-4 py-16 text-center text-stone-500">
            {error ?? 'Le menu n’est pas encore disponible.'}
          </p>
        ) : (
          <>
            <nav className="sticky top-0 z-30 border-b border-stone-200/70 bg-stone-50/90 backdrop-blur">
              <div className="no-scrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3">
                {visibleCats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setActiveCat(c.id);
                      document.getElementById(`ccat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
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
            </nav>

            <main className="mx-auto max-w-3xl space-y-8 px-4 pt-6">
              {visibleCats.map((c) => (
                <section key={c.id} id={`ccat-${c.id}`} className="scroll-mt-20">
                  <h2 className="mb-3 text-lg font-semibold tracking-tight">{c.name}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {products
                      .filter((p) => p.categoryId === c.id)
                      .map((p) => (
                        <div
                          key={p.id}
                          className={`flex w-full items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70 ${
                            p.isAvailable ? '' : 'opacity-60'
                          }`}
                        >
                          <Thumb name={p.name} url={p.imageUrl} />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold">{p.name}</h3>
                            {p.description && (
                              <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{p.description}</p>
                            )}
                            <p className="mt-1.5 font-semibold">{fcfa(p.priceFcfa)}</p>
                          </div>
                          {!p.isAvailable ? (
                            <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                              Indisponible
                            </span>
                          ) : inCart(p.id) === 0 ? (
                            <button
                              type="button"
                              aria-label={`Ajouter ${p.name}`}
                              onClick={() => addOne(p)}
                              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white shadow-sm shadow-brand-500/30 transition active:scale-95"
                            >
                              <PlusIcon />
                            </button>
                          ) : (
                            <div className="flex shrink-0 items-center gap-1 rounded-full bg-stone-100 p-1">
                              <button
                                type="button"
                                aria-label={`Retirer un ${p.name}`}
                                onClick={() => removeOne(p)}
                                className="grid h-8 w-8 place-items-center rounded-full bg-white text-stone-700 shadow-sm transition active:scale-95"
                              >
                                <MinusIcon className="h-4 w-4" />
                              </button>
                              <span className="min-w-6 text-center text-sm font-bold tabular-nums">{inCart(p.id)}</span>
                              <button
                                type="button"
                                aria-label={`Ajouter un ${p.name}`}
                                onClick={() => addOne(p)}
                                className="grid h-8 w-8 place-items-center rounded-full bg-brand-500 text-white shadow-sm transition active:scale-95"
                              >
                                <PlusIcon className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </main>
          </>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          disabled={cart.count === 0}
          className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl bg-stone-900 px-5 py-4 text-white shadow-xl shadow-stone-900/25 transition active:scale-[0.99] disabled:bg-stone-400 disabled:shadow-none"
        >
          <span className="flex items-center gap-3">
            <span className="relative">
              <BagIcon />
              <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[11px] font-bold">
                {cart.count}
              </span>
            </span>
            <span className="font-medium">Voir la commande</span>
          </span>
          <span className="font-semibold">{fcfa(total)}</span>
        </button>
      </div>

      {cartOpen && (
        <Sheet label="Commande en cours" onClose={() => (busy ? undefined : setCartOpen(false))}>
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <h2 className="text-lg font-semibold tracking-tight">
              {askName ? 'Nom du client' : paying ? 'Encaisser' : 'Commande en cours'}
            </h2>
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              aria-label="Fermer"
              className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {askName ? (
              <div>
                <label htmlFor="c-name" className="mb-1.5 block text-sm font-semibold text-stone-700">
                  Nom du client
                </label>
                <input
                  id="c-name"
                  autoFocus
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  maxLength={40}
                  placeholder="Appelé au haut-parleur quand la commande est prête"
                  className={inputCls}
                />
              </div>
            ) : !paying ? (
              <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
                {cart.lines.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name}</p>
                      {l.options.length > 0 && (
                        <p className="truncate text-xs text-stone-500">+ {l.options.map((o) => o.name).join(', ')}</p>
                      )}
                      <p className="text-sm font-semibold">{fcfa(unitPrice(l) * l.quantity)}</p>
                    </div>
                    <Stepper value={l.quantity} min={0} onChange={(q) => cart.setQuantity(l.key, q)} />
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <span className="text-stone-500">Total à payer</span>
                  <span className="text-3xl font-semibold tracking-tight">{fcfa(total)}</span>
                </div>
                <div>
                  <label htmlFor="c-received" className="mb-1.5 block text-sm font-semibold text-stone-700">
                    Montant reçu
                  </label>
                  <input
                    id="c-received"
                    inputMode="numeric"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-xl font-semibold outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quick.map((v, i) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setReceived(String(v))}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          amount === v ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
                        }`}
                      >
                        {i === 0 ? 'Montant exact' : fcfa(v)}
                      </button>
                    ))}
                  </div>
                </div>
                {validAmount && change > 0 && <ChangeVoucherPanel change={change} voucher={voucher} />}
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    validAmount ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {validAmount ? (
                    <p className="flex items-center justify-between font-medium">
                      <span>Monnaie à rendre</span>
                      <span className="text-lg font-semibold">{fcfa(change)}</span>
                    </p>
                  ) : (
                    <p className="font-medium">Il manque {fcfa(-change)}</p>
                  )}
                </div>
              </>
            )}

            {error && (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
            )}
          </div>

          <div className="space-y-2 border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {!paying && !askName && (
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-stone-500">Total</span>
                <span className="text-lg font-semibold">{fcfa(total)}</span>
              </div>
            )}
            {waiter ? (
              <button
                type="button"
                onClick={() => void submit(false)}
                disabled={busy || needTable}
                className="w-full rounded-2xl bg-brand-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? 'Envoi…' : needTable ? 'Choisissez la table' : 'Envoyer en cuisine'}
              </button>
            ) : askName ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (needName) return setError('Saisissez le nom du client (2 lettres minimum)');
                    setError(null);
                    const next = askName;
                    setAskName(null);
                    if (next === 'pay') {
                      setReceived(String(total));
                      setPaying(true);
                    } else {
                      void submit(false);
                    }
                  }}
                  disabled={busy}
                  className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {askName === 'pay' ? 'Continuer vers l’encaissement' : 'Enregistrer la commande'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setAskName(null);
                  }}
                  className="w-full rounded-2xl bg-stone-100 px-5 py-3 font-medium text-stone-700"
                >
                  Retour
                </button>
              </>
            ) : paying ? (
              <>
                <button
                  type="button"
                  onClick={() => void submit(true, { amountReceivedFcfa: amount, voucherFcfa: voucher.amount })}
                  disabled={busy || !validAmount || !voucher.valid}
                  className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? 'Enregistrement…' : `Confirmer l’encaissement · ${fcfa(total)}`}
                </button>
                <button
                  type="button"
                  onClick={() => setPaying(false)}
                  disabled={busy}
                  className="w-full rounded-2xl bg-stone-100 px-5 py-3 font-medium text-stone-700"
                >
                  Retour
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (needName) {
                      setError(null);
                      setAskName('later');
                    } else void submit(false);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-stone-100 px-4 py-3.5 font-semibold text-stone-800 transition active:scale-[0.98] disabled:opacity-50"
                >
                  Payer plus tard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    if (needName) {
                      setAskName('pay');
                      return;
                    }
                    setReceived(String(total));
                    setPaying(true);
                  }}
                  disabled={busy || !session}
                  className="rounded-2xl bg-brand-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] disabled:opacity-50"
                >
                  Encaisser maintenant
                </button>
              </div>
            )}
            {!waiter && !session && (
              <p className="text-center text-xs text-stone-500">Ouvrez votre caisse pour encaisser tout de suite.</p>
            )}
          </div>
        </Sheet>
      )}

      {selected && (
        <ProductSheet
          product={selected}
          onClose={() => setSelected(null)}
          onAdd={(quantity, options) => {
            cart.add(selected, quantity, options, '');
            setSelected(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}
