import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/AdminLayout';
import { RequireSuperAdmin } from '../../components/RequireSuperAdmin';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { dateTimeFr } from '../../lib/format';

type SecEvent = {
  id: string;
  action: string;
  createdAt: string;
  ip: string | null;
  email: string | null;
  path: string | null;
  reason: string | null;
};
type SecData = {
  hours: number;
  counts: Record<string, number>;
  topIps: { ip: string; count: number }[];
  events: SecEvent[];
};

const LABELS: Record<string, { label: string; tone: string }> = {
  LOGIN_FAILED: { label: 'Connexion échouée', tone: 'bg-amber-50 text-amber-800' },
  LOGIN_BLOCKED: { label: 'Tentative sur compte bloqué', tone: 'bg-red-50 text-red-700' },
  ACCOUNT_LOCKED: { label: 'Compte bloqué', tone: 'bg-red-50 text-red-700' },
  RATE_LIMITED: { label: 'Trop de requêtes (bloqué)', tone: 'bg-orange-50 text-orange-800' },
  ACCESS_DENIED: { label: 'Accès interdit', tone: 'bg-red-50 text-red-700' },
};

const PERIODS = [
  { hours: 24, label: '24 heures' },
  { hours: 168, label: '7 jours' },
  { hours: 720, label: '30 jours' },
];

function Security() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<SecData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  const load = useCallback(async () => {
    try {
      setData(await authRequest<SecData>(`/admin/security?hours=${hours}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    }
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  const events = (data?.events ?? []).filter((e) => filter === 'ALL' || e.action === filter);
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin" className="text-sm font-medium text-brand-600">
          ← Retour aux restaurants
        </Link>
        <div className="flex gap-1 rounded-full bg-stone-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.hours}
              type="button"
              onClick={() => setHours(p.hours)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                hours === p.hours ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'RATE_LIMITED', 'ACCESS_DENIED'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(filter === k ? 'ALL' : k)}
            className={`rounded-3xl bg-white p-4 text-left shadow-sm ring-1 transition active:scale-[0.98] ${
              filter === k ? 'ring-brand-500' : 'ring-stone-200/70'
            }`}
          >
            <p className="text-3xl font-semibold tabular-nums">{data?.counts[k] ?? 0}</p>
            <p className="mt-1 text-xs text-stone-500">{LABELS[k].label}</p>
          </button>
        ))}
      </section>

      <section
        className={`rounded-3xl p-5 ring-1 ${
          total === 0 ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-stone-200/70'
        }`}
      >
        {total === 0 ? (
          <p className="text-sm font-medium text-emerald-800">
            Aucune activité suspecte sur cette période.
          </p>
        ) : (
          <>
            <h2 className="font-semibold tracking-tight">Adresses les plus actives</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Une même adresse qui revient très souvent peut être une tentative d’intrusion.
            </p>
            <ul className="mt-3 space-y-1.5">
              {data?.topIps.map((i) => (
                <li key={i.ip} className="flex justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
                  <span className="font-mono">{i.ip}</span>
                  <span className="font-semibold tabular-nums">{i.count} événements</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold tracking-tight">Journal détaillé</h2>
          {filter !== 'ALL' && (
            <button type="button" onClick={() => setFilter('ALL')} className="text-sm font-medium text-brand-600">
              Tout afficher
            </button>
          )}
        </div>
        {!data ? (
          <p className="mt-4 animate-pulse text-sm text-stone-400">Chargement…</p>
        ) : events.length === 0 ? (
          <p className="mt-4 text-sm text-stone-400">Rien à afficher.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {events.map((e) => {
              const meta = LABELS[e.action] ?? { label: e.action, tone: 'bg-stone-100 text-stone-600' };
              return (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>
                    <p className="mt-1.5 break-all text-sm text-stone-600">
                      {[e.email && `Compte : ${e.email}`, e.reason, e.path].filter(Boolean).join(' · ')}
                    </p>
                    {e.ip && <p className="font-mono text-xs text-stone-400">{e.ip}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-stone-400">{dateTimeFr(e.createdAt)}</time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

export default function SecurityPage() {
  return (
    <RequireSuperAdmin>
      <AdminLayout title="Sécurité">
        <Security />
      </AdminLayout>
    </RequireSuperAdmin>
  );
}
