import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { fcfa } from '../lib/format';
import type { MenuProduct, PublicMenu } from '../lib/types';
import { useCart } from '../features/order/useCart';
import { ProductSheet } from '../components/ProductSheet';
import { CartSheet } from '../components/CartSheet';
import { BagIcon, PlusIcon } from '../components/icons';

function Thumb({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img src={url} alt={name} loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
  ) : (
    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 text-2xl font-semibold text-brand-600">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function StateScreen({
  title,
  text,
  onRetry,
}: {
  title: string;
  text: string;
  onRetry?: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-xs">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-stone-500">{text}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Réessayer
          </button>
        )}
      </div>
    </main>
  );
}

function ClientMenu({ token }: { token: string }) {
  const cart = useCart(token);
  const [data, setData] = useState<PublicMenu | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .getMenu(token)
      .then((d) => {
        setData(d);
        setActiveCat(d.menu[0]?.id ?? null);
      })
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError
            ? { code: e.code, message: e.message }
            : { code: 'ERROR', message: 'Erreur inattendue' },
        ),
      );
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Met en évidence la catégorie visible pendant le défilement
  useEffect(() => {
    if (!data) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveCat(top.target.id.replace('cat-', ''));
      },
      { rootMargin: '-140px 0px -65% 0px' },
    );
    data.menu.forEach((c) => {
      const el = document.getElementById(`cat-${c.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (cart.count === 0) setCartOpen(false);
  }, [cart.count]);

  if (error) {
    const title =
      error.code === 'NOT_FOUND'
        ? 'QR code inconnu'
        : error.code === 'QR_INACTIVE'
          ? "Ce QR code n'est plus actif"
          : 'Menu indisponible';
    const text =
      error.code === 'NOT_FOUND' || error.code === 'QR_INACTIVE'
        ? 'Demandez au personnel de vous indiquer le QR code à jour.'
        : error.message;
    const retry = error.code === 'NOT_FOUND' || error.code === 'QR_INACTIVE' ? undefined : load;
    return <StateScreen title={title} text={text} onRetry={retry} />;
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4">
        <div className="h-24 animate-pulse rounded-3xl bg-stone-200/70" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-stone-200/60" />
        ))}
      </main>
    );
  }

  return (
    <div className="min-h-dvh pb-32">
      <header className="bg-gradient-to-b from-brand-50 to-stone-50 px-4 pb-5 pt-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">{data.restaurant.name}</h1>
          <p className="mt-2 inline-flex items-center rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/70">
            {data.table ? data.table.label : data.orderType === 'DELIVERY' ? 'Livraison' : 'À emporter'}
          </p>
        </div>
      </header>

      {data.menu.length === 0 ? (
        <p className="px-4 py-16 text-center text-stone-500">
          Le menu n'est pas encore disponible.
        </p>
      ) : (
        <>
          <nav className="sticky top-0 z-30 border-b border-stone-200/70 bg-stone-50/90 backdrop-blur">
            <div className="no-scrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3">
              {data.menu.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveCat(c.id);
                    document
                      .getElementById(`cat-${c.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            {data.menu.map((c) => (
              <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-20">
                <h2 className="mb-3 text-lg font-semibold tracking-tight">{c.name}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {c.products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!p.isAvailable}
                      onClick={() => setSelected(p)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-200/70 transition hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Thumb name={p.name} url={p.imageUrl} />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{p.name}</h3>
                        {p.description && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">
                            {p.description}
                          </p>
                        )}
                        <p className="mt-1.5 font-semibold">{fcfa(p.priceFcfa)}</p>
                      </div>
                      {p.isAvailable ? (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white shadow-sm shadow-brand-500/30">
                          <PlusIcon />
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                          Indisponible
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </main>
        </>
      )}

      {cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl bg-stone-900 px-5 py-4 text-white shadow-xl shadow-stone-900/25 transition active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              <span className="relative">
                <BagIcon />
                <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[11px] font-bold">
                  {cart.count}
                </span>
              </span>
              <span className="font-medium">Voir mon panier</span>
            </span>
            <span className="font-semibold">{fcfa(cart.subtotal)}</span>
          </button>
        </div>
      )}

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

      {cartOpen && (
        <CartSheet
          token={token}
          cart={cart}
          delivery={data.orderType === 'DELIVERY'}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}

// La clé force un panier propre si le client ouvre un autre QR code
export default function ClientMenuPage() {
  const { token = '' } = useParams();
  return <ClientMenu key={token} token={token} />;
}