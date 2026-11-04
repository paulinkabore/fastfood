import { useCallback, useEffect, useState } from 'react';
import { CategoryEditor } from '../../components/menu/CategoryEditor';
import { ProductEditor } from '../../components/menu/ProductEditor';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { RequireRole } from '../../components/RequireRole';
import { StaffLayout } from '../../components/StaffLayout';
import { PlusIcon } from '../../components/icons';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { fcfa } from '../../lib/format';
import {
  SUGGESTED_CATEGORIES,
  normalizeName,
  type CategoryRow,
  type ProductRow,
} from '../../features/menu/menu';

type ConfirmState = { kind: 'product' | 'category'; id: string; title: string; text: string };

function Thumb({ product }: { product: ProductRow }) {
  return product.imageUrl ? (
    <img
      src={product.imageUrl}
      alt={product.name}
      loading="lazy"
      className="h-24 w-24 shrink-0 rounded-2xl object-cover"
    />
  ) : (
    <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 text-3xl font-semibold text-brand-600">
      {product.name.charAt(0).toUpperCase()}
    </div>
  );
}

function Menu({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('all');
  const [editProduct, setEditProduct] = useState<ProductRow | 'new' | null>(null);
  const [editCategory, setEditCategory] = useState<CategoryRow | 'new' | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        authRequest<{ categories: CategoryRow[] }>(`${base}/categories`),
        authRequest<{ products: ProductRow[] }>(`${base}/products`),
      ]);
      setCategories(c.categories);
      setProducts(p.products);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // Une seule action à la fois : pas de double clic
  const run = async (key: string, fn: () => Promise<unknown>, okMessage?: string) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await load();
      if (okMessage) setMessage(okMessage);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(null);
    }
  };

  // Catégories voulues qui n'existent pas encore
  const existing = new Set(categories.map((c) => normalizeName(c.name)));
  const missing = SUGGESTED_CATEGORIES.filter((n) => !existing.has(normalizeName(n)));

  const createSuggested = () =>
    run(
      'suggest',
      async () => {
        let order = categories.reduce((m, c) => Math.max(m, c.sortOrder), 0);
        for (const name of missing) {
          order += 1;
          await authRequest(`${base}/categories`, {
            method: 'POST',
            body: JSON.stringify({ name, sortOrder: order }),
          });
        }
      },
      `${missing.length} catégorie${missing.length > 1 ? 's' : ''} créée${missing.length > 1 ? 's' : ''}`,
    );

  const saveCategory = async (data: { name: string; sortOrder: number; isActive: boolean }) => {
    if (busy || !editCategory) return;
    setBusy('cat');
    setCatError(null);
    try {
      if (editCategory === 'new') {
        await authRequest(`${base}/categories`, {
          method: 'POST',
          body: JSON.stringify({ name: data.name, sortOrder: data.sortOrder }),
        });
      } else {
        await authRequest(`${base}/categories/${editCategory.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      }
      await load();
      setEditCategory(null);
      setMessage('Catégorie enregistrée');
    } catch (e) {
      setCatError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(null);
    }
  };

  const toggleAvailability = (p: ProductRow) =>
    run(
      `av:${p.id}`,
      () =>
        authRequest(`${base}/products/${p.id}/availability`, {
          method: 'PATCH',
          body: JSON.stringify({ isAvailable: !p.isAvailable }),
        }),
      p.isAvailable ? `« ${p.name} » marqué indisponible` : `« ${p.name} » de nouveau disponible`,
    );

  const confirmRun = async () => {
    const c = confirm;
    if (!c) return;
    await run(
      `del:${c.id}`,
      async () => {
        if (c.kind === 'product') {
          await authRequest(`${base}/products/${c.id}`, { method: 'DELETE' });
        } else {
          await authRequest(`${base}/categories/${c.id}`, { method: 'DELETE' });
          setSelected('all');
        }
      },
      'Supprimé',
    );
    setConfirm(null);
  };

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const currentCategory = categories.find((c) => c.id === selected) ?? null;
  const shown = selected === 'all' ? products : products.filter((p) => p.categoryId === selected);
  const anyBusy = busy !== null;

  const pill = (active: boolean, muted = false) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
      active
        ? 'bg-stone-900 text-white'
        : `bg-white ring-1 ring-stone-200 ${muted ? 'text-stone-400' : 'text-stone-600'}`
    }`;

  return (
    <>
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      )}
      {message && (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </p>
      )}

      {!loading && missing.length > 0 && (
        <section className="rounded-3xl border border-brand-100 bg-brand-50/60 p-5">
          <h2 className="font-semibold tracking-tight">Vos catégories</h2>
          <p className="mt-1 text-sm text-stone-600">
            Il manque {missing.length} catégorie{missing.length > 1 ? 's' : ''} sur celles que vous
            souhaitez : <span className="font-medium">{missing.join(', ')}</span>.
          </p>
          <button
            type="button"
            disabled={anyBusy}
            onClick={() => void createSuggested()}
            className="mt-3 rounded-2xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97] disabled:opacity-60"
          >
            {busy === 'suggest' ? 'Création…' : `Créer ces ${missing.length} catégories`}
          </button>
        </section>
      )}

      <section className="space-y-3">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button type="button" className={pill(selected === 'all')} onClick={() => setSelected('all')}>
            Tous ({products.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={pill(selected === c.id, !c.isActive)}
              onClick={() => setSelected(c.id)}
            >
              {c.name} ({products.filter((p) => p.categoryId === c.id).length})
              {c.isActive ? '' : ' · masquée'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCatError(null);
              setEditCategory('new');
            }}
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-stone-300 px-4 py-2 text-sm font-medium text-stone-500"
          >
            <PlusIcon className="h-4 w-4" />
            Catégorie
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {currentCategory && (
              <>
                <button
                  type="button"
                  disabled={anyBusy}
                  onClick={() => {
                    setCatError(null);
                    setEditCategory(currentCategory);
                  }}
                  className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200 disabled:opacity-50"
                >
                  Modifier la catégorie
                </button>
                <button
                  type="button"
                  disabled={anyBusy}
                  onClick={() =>
                    setConfirm({
                      kind: 'category',
                      id: currentCategory.id,
                      title: `Supprimer « ${currentCategory.name} » ?`,
                      text: 'Impossible si la catégorie contient encore des produits : déplacez ou supprimez-les d’abord, ou masquez la catégorie.',
                    })
                  }
                  className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  Supprimer la catégorie
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            disabled={anyBusy || categories.length === 0}
            onClick={() => setEditProduct('new')}
            className="flex items-center gap-1.5 rounded-2xl bg-brand-500 px-5 py-2.5 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97] disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Ajouter un produit
          </button>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl bg-stone-200/60" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-14 text-center text-sm text-stone-400">
          {categories.length === 0
            ? 'Créez d’abord une catégorie pour pouvoir ajouter des produits.'
            : 'Aucun produit ici. Cliquez sur « Ajouter un produit ».'}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((p) => (
            <article
              key={p.id}
              className={`flex gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 ${
                p.isAvailable ? '' : 'opacity-75'
              }`}
            >
              <Thumb product={p} />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold tracking-tight">{p.name}</h3>
                    {selected === 'all' && (
                      <p className="truncate text-xs text-stone-400">{categoryName.get(p.categoryId)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.isAvailable}
                    aria-label={p.isAvailable ? 'Marquer indisponible' : 'Marquer disponible'}
                    disabled={anyBusy}
                    onClick={() => void toggleAvailability(p)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
                      p.isAvailable ? 'bg-emerald-500' : 'bg-stone-300'
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                        p.isAvailable ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-0.5 font-semibold text-brand-600">{fcfa(p.priceFcfa)}</p>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-stone-500">{p.description}</p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {!p.isAvailable && (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                      Indisponible
                    </span>
                  )}
                  {p.options.length > 0 && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                      {p.options.length} option{p.options.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {p.allergens.length > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {p.allergens.join(', ')}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex gap-2 pt-3">
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => setEditProduct(p)}
                    className="rounded-xl bg-stone-100 px-3.5 py-2 text-sm font-medium text-stone-700 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() =>
                      setConfirm({
                        kind: 'product',
                        id: p.id,
                        title: `Supprimer « ${p.name} » ?`,
                        text: 'Le produit disparaît du menu. S’il a déjà été commandé, la suppression est refusée : marquez-le plutôt indisponible.',
                      })
                    }
                    className="rounded-xl bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editProduct && (
        <ProductEditor
          key={editProduct === 'new' ? 'new' : editProduct.id}
          restaurantId={restaurantId}
          product={editProduct === 'new' ? null : editProduct}
          categories={categories}
          defaultCategoryId={selected !== 'all' ? selected : (categories[0]?.id ?? '')}
          onClose={() => setEditProduct(null)}
          onChanged={() => void load()}
        />
      )}

      {editCategory && (
        <CategoryEditor
          category={editCategory === 'new' ? null : editCategory}
          busy={busy === 'cat'}
          error={catError}
          onSubmit={(d) => void saveCategory(d)}
          onClose={() => setEditCategory(null)}
        />
      )}

      {confirm && (
        <ConfirmSheet
          title={confirm.title}
          text={confirm.text}
          confirmLabel="Supprimer"
          danger
          busy={anyBusy}
          onConfirm={() => void confirmRun()}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

export default function MenuPage() {
  return (
    <RequireRole roles={['MANAGER']}>
      {({ restaurantId }) => (
        <StaffLayout restaurantId={restaurantId} title="Menu et produits">
          <Menu restaurantId={restaurantId} />
        </StaffLayout>
      )}
    </RequireRole>
  );
}