import { Link } from 'react-router-dom';
import { RequireRole } from '../../components/RequireRole';
import { StaffLayout } from '../../components/StaffLayout';

type Section = { title: string; text: string; to?: string };

// Une section sans « to » est annoncée « Bientôt » : elle devient un lien quand l'écran est livré
const SECTIONS: Section[] = [
  { title: 'Commandes du jour', text: 'Suivre, annuler et rembourser les commandes.', to: '/gestion/commandes' },
  { title: 'Tables & QR codes', text: 'Créez vos tables, générez et imprimez les QR codes.', to: '/gestion/tables' },
  { title: 'Cuisine', text: 'Les commandes en direct, de la réception à « prête ».', to: '/cuisine' },
  { title: 'Caisse', text: 'Ouverture de caisse, encaissements, reçus, clôture.', to: '/caisse' },
  { title: 'Service', text: 'Les commandes par table, prêtes à servir.', to: '/service' },
  { title: 'Menu et produits', text: 'Catégories, prix, photos, options, disponibilité.', to: '/gestion/menu' },
  { title: 'Stocks', text: 'Ingrédients, recettes, entrées, pertes, inventaire.', to: '/gestion/stock' },
  { title: 'Statistiques', text: 'Chiffre d’affaires, produits populaires, exports.' },
  { title: 'Personnel', text: 'Comptes du personnel et leurs rôles.', to: '/gestion/personnel' },
];

function Home() {
  const done = SECTIONS.filter((s) => s.to).length;
  const pct = Math.round((done / SECTIONS.length) * 100);

  return (
    <>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200/70">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Avancement de l’application</h2>
            <p className="mt-1 text-sm text-stone-500">
              {done} écran{done > 1 ? 's' : ''} disponible{done > 1 ? 's' : ''} sur {SECTIONS.length}
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-tight text-brand-500">{pct} %</p>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((s) =>
          s.to ? (
            <Link
              key={s.title}
              to={s.to}
              className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Disponible
              </span>
              <h3 className="mt-3 font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-500">{s.text}</p>
              <p className="mt-3 text-sm font-medium text-brand-600 transition group-hover:translate-x-0.5">
                Ouvrir →
              </p>
            </Link>
          ) : (
            <div
              key={s.title}
              className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/60 p-5"
            >
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-500">
                Bientôt
              </span>
              <h3 className="mt-3 font-semibold tracking-tight text-stone-500">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-400">{s.text}</p>
            </div>
          ),
        )}
      </section>
    </>
  );
}

export default function ManagerHomePage() {
  return (
    <RequireRole roles={['MANAGER']}>
      {({ restaurantId }) => (
        <StaffLayout restaurantId={restaurantId} title="Gestion du restaurant">
          <Home />
        </StaffLayout>
      )}
    </RequireRole>
  );
}