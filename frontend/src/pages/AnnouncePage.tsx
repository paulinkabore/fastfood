import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RequireRole } from '../components/RequireRole';
import { StaffLayout } from '../components/StaffLayout';
import { useKitchen } from '../features/kitchen/useKitchen';
import { placeLabel } from '../lib/orderPlace';
import { readyAnnouncement, speak, speechAvailable, unlockAudio } from '../lib/sound';

// Écran à brancher sur les haut-parleurs : chaque commande qui passe « prête » est annoncée à voix haute
function Announcer({ restaurantId, standalone }: { restaurantId: string; standalone: boolean }) {
  const [active, setActive] = useState(false);
  const { orders, loading, live } = useKitchen(restaurantId, () => {});
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (loading) return;
    const ready = orders.filter((o) => o.status === 'READY');
    // Au chargement de l'écran, ce qui est déjà prêt n'est pas ré-annoncé
    if (seen.current === null) {
      seen.current = new Set(ready.map((o) => o.id));
      return;
    }
    for (const o of ready) {
      if (!seen.current.has(o.id)) {
        seen.current.add(o.id);
        if (active) speak(readyAnnouncement(o.number, placeLabel(o)));
      }
    }
  }, [orders, loading, active]);

  const ready = orders.filter((o) => o.status === 'READY');

  if (!speechAvailable()) {
    return (
      <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Ce navigateur ne sait pas lire de voix. Utilisez Chrome ou Edge.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <h2 className="text-lg font-semibold tracking-tight">Annonces vocales</h2>
        <p className="mt-1 text-sm text-stone-500">
          Branchez cet appareil aux haut-parleurs (câble jack, Bluetooth ou HDMI), activez les annonces et laissez
          cette page ouverte. Quand le cuisinier marque une commande « prête », elle est annoncée deux fois avec le
          numéro de la table.
        </p>
        <button
          type="button"
          onClick={() => {
            if (!active) {
              unlockAudio();
              speak('Annonces vocales activées. Test du haut-parleur.', 1);
            } else {
              window.speechSynthesis.cancel();
            }
            setActive((v) => !v);
          }}
          className={`mt-4 w-full rounded-2xl px-5 py-4 font-semibold shadow-lg transition active:scale-[0.98] sm:w-auto ${
            active ? 'bg-emerald-600 text-white shadow-emerald-600/25' : 'bg-brand-500 text-white shadow-brand-500/30'
          }`}
        >
          {active ? 'Annonces activées · Toucher pour arrêter' : 'Activer les annonces vocales'}
        </button>
        <p className="mt-3 flex items-center gap-2 text-xs text-stone-500">
          <span className={`h-2 w-2 rounded-full ${live || !loading ? 'bg-emerald-500' : 'animate-pulse bg-red-500'}`} />
          {loading ? 'Chargement…' : 'En écoute des commandes'}
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-stone-700">Commandes prêtes ({ready.length})</h3>
        {ready.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-400">
            Aucune commande prête pour le moment
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ready.map((o) => (
              <article key={o.id} className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-100">
                <p className="text-4xl font-semibold tracking-tight text-emerald-800">#{o.number}</p>
                <p className="mt-1 text-lg font-medium text-emerald-700">{placeLabel(o)}</p>
                <button
                  type="button"
                  disabled={!active}
                  onClick={() => speak(readyAnnouncement(o.number, placeLabel(o)))}
                  className="mt-3 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-emerald-700 transition active:scale-[0.97] disabled:opacity-50"
                >
                  Répéter l’annonce
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {standalone && (
        <Link to="/" className="inline-block text-sm font-medium text-stone-500 underline">
          Retour
        </Link>
      )}
    </div>
  );
}

export default function AnnouncePage() {
  return (
    <RequireRole roles={['MANAGER', 'COOK', 'WAITER', 'CASHIER']}>
      {({ restaurantId, role }) =>
        role === 'MANAGER' ? (
          <StaffLayout restaurantId={restaurantId} title="Annonces vocales">
            <Announcer key={restaurantId} restaurantId={restaurantId} standalone={false} />
          </StaffLayout>
        ) : (
          <main className="mx-auto max-w-5xl p-4">
            <Announcer key={restaurantId} restaurantId={restaurantId} standalone />
          </main>
        )
      }
    </RequireRole>
  );
}
