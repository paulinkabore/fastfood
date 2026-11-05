import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart } from '../../components/stats/BarChart';
import { RequireRole } from '../../components/RequireRole';
import { StaffLayout } from '../../components/StaffLayout';
import {
  METHOD_LABEL,
  PRESETS,
  dayLong,
  dayShort,
  daysBetween,
  presetRange,
  todayYmd,
  type PresetId,
  type Stats,
} from '../../features/stats/stats';
import { ApiError } from '../../lib/api';
import { authBlob, authRequest } from '../../lib/auth';
import { saveBlob } from '../../lib/download';
import { fcfa } from '../../lib/format';

function Kpi({
  label,
  value,
  hint,
  dark = false,
}: {
  label: string;
  value: string;
  hint?: string;
  dark?: boolean;
}) {
  return (
    <div className={`rounded-3xl p-5 shadow-sm ${dark ? 'bg-stone-900 text-white' : 'bg-white ring-1 ring-stone-200/70'}`}>
      <p className={`text-xs font-medium ${dark ? 'text-stone-300' : 'text-stone-500'}`}>{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className={`mt-0.5 text-xs ${dark ? 'text-stone-400' : 'text-stone-400'}`}>{hint}</p>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
      <h2 className="font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Statistics({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;
  const [preset, setPreset] = useState<PresetId>('7d');
  const [range, setRange] = useState(() => presetRange('7d'));
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  const days = daysBetween(range.from, range.to);
  const rangeError =
    !range.from || !range.to
      ? 'Choisissez deux dates'
      : range.from > range.to
        ? 'La date de début doit précéder la date de fin'
        : days > 92
          ? 'La période ne peut pas dépasser 92 jours'
          : null;

  const load = useCallback(async () => {
    if (rangeError) return;
    const id = ++seq.current; // ignore les réponses arrivées dans le désordre
    setLoading(true);
    try {
      const d = await authRequest<Stats>(`${base}/stats?from=${range.from}&to=${range.to}`);
      if (id !== seq.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (id !== seq.current) return;
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [base, range.from, range.to, rangeError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Les chiffres bougent pendant la journée : on les relit au retour sur l'onglet
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  const exportCsv = async () => {
    if (exporting || rangeError) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await authBlob(`${base}/stats/export.csv?from=${range.from}&to=${range.to}`);
      saveBlob(blob, `commandes-${range.from}_${range.to}.csv`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setExporting(false);
    }
  };

  const pill = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;
  const dateField =
    'rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500';

  const s = data?.summary;
  const empty = data !== null && s!.ordersCount === 0 && s!.collectedCount === 0 && s!.cancelledCount === 0;
  const topMax = Math.max(1, ...(data?.topProducts.map((p) => p.quantity) ?? [0]));
  const collected = s?.collectedFcfa ?? 0;

  return (
    <>
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={pill(preset === p.id)}
                onClick={() => {
                  setPreset(p.id);
                  setRange(presetRange(p.id));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || rangeError !== null}
            className="rounded-2xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.97] disabled:opacity-50"
          >
            {exporting ? 'Préparation…' : 'Exporter en CSV'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-stone-500">
            Du
            <input
              type="date"
              value={range.from}
              max={todayYmd()}
              onChange={(e) => {
                setPreset('custom');
                setRange((r) => ({ ...r, from: e.target.value }));
              }}
              className={dateField}
            />
          </label>
          <label className="flex items-center gap-2 text-stone-500">
            au
            <input
              type="date"
              value={range.to}
              max={todayYmd()}
              onChange={(e) => {
                setPreset('custom');
                setRange((r) => ({ ...r, to: e.target.value }));
              }}
              className={dateField}
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200"
          >
            Actualiser
          </button>
          {loading && data && <span className="animate-pulse text-xs text-stone-400">Mise à jour…</span>}
        </div>
        {rangeError && <p className="text-sm font-medium text-red-700">{rangeError}</p>}
      </section>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      )}

      {!data ? (
        loading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-stone-200/60" />
            ))}
          </div>
        )
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              dark
              label="Ventes"
              value={fcfa(s!.salesFcfa)}
              hint="commandes non annulées, payées ou non"
            />
            <Kpi label="Commandes" value={String(s!.ordersCount)} hint={`panier moyen ${fcfa(s!.averageBasketFcfa)}`} />
            <Kpi
              label="Encaissé"
              value={fcfa(s!.collectedFcfa)}
              hint={`${s!.collectedCount} paiement${s!.collectedCount > 1 ? 's' : ''}`}
            />
            <Kpi
              label="À encaisser"
              value={fcfa(s!.unpaidFcfa)}
              hint={`${s!.unpaidCount} commande${s!.unpaidCount > 1 ? 's' : ''}`}
            />
            <Kpi label="Annulées" value={String(s!.cancelledCount)} />
            <Kpi
              label="Remboursé"
              value={fcfa(s!.refundedFcfa)}
              hint={`${s!.refundedCount} remboursement${s!.refundedCount > 1 ? 's' : ''}`}
            />
          </section>

          {empty && (
            <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-400">
              Aucune vente sur cette période.
            </p>
          )}

          {data.range.days > 1 && (
            <Card title="Ventes par jour" subtitle="Chiffre d’affaires des commandes comptées">
              <BarChart
                ariaLabel="Ventes par jour"
                items={data.byDay.map((d) => ({
                  label: dayShort(d.date),
                  value: d.salesFcfa,
                  title: `${dayLong(d.date)} : ${fcfa(d.salesFcfa)}, ${d.orders} commande${d.orders > 1 ? 's' : ''}`,
                }))}
              />
            </Card>
          )}

          <Card title="Commandes par heure" subtitle="Les heures les plus chargées de la période">
            <BarChart
              ariaLabel="Commandes par heure"
              tone="bg-stone-800"
              items={data.byHour.map((h) => ({
                label: `${h.hour} h`,
                value: h.orders,
                title: `${h.hour} h : ${h.orders} commande${h.orders > 1 ? 's' : ''}, ${fcfa(h.salesFcfa)}`,
              }))}
            />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Produits les plus vendus" subtitle="Classés par quantité">
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-stone-400">Aucune vente.</p>
              ) : (
                <ol className="space-y-3">
                  {data.topProducts.map((p, i) => (
                    <li key={p.productId}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-medium">
                          <span className="mr-2 text-stone-400">{i + 1}</span>
                          {p.name}
                        </p>
                        <p className="shrink-0 text-sm">
                          <span className="font-semibold">{p.quantity}</span>
                          <span className="text-stone-400"> · {fcfa(p.revenueFcfa)}</span>
                        </p>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${(p.quantity / topMax) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="Modes de paiement" subtitle="Paiements confirmés sur la période">
              {data.paymentMethods.length === 0 ? (
                <p className="text-sm text-stone-400">Aucun paiement.</p>
              ) : (
                <ul className="space-y-4">
                  {data.paymentMethods.map((m) => (
                    <li key={m.method}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium">{METHOD_LABEL[m.method] ?? m.method}</p>
                        <p className="text-sm">
                          <span className="font-semibold">{fcfa(m.amountFcfa)}</span>
                          <span className="text-stone-400">
                            {' '}
                            · {m.count} paiement{m.count > 1 ? 's' : ''}
                            {collected > 0 ? ` · ${Math.round((m.amountFcfa / collected) * 100)} %` : ''}
                          </span>
                        </p>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${collected > 0 ? (m.amountFcfa / collected) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {s!.refundedCount > 0 && (
                <p className="mt-4 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
                  {fcfa(s!.refundedFcfa)} remboursés sur la période, comptés à part (non inclus dans
                  « Encaissé »).
                </p>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export default function StatsPage() {
  return (
    <RequireRole roles={['MANAGER']}>
      {({ restaurantId }) => (
        <StaffLayout restaurantId={restaurantId} title="Statistiques">
          <Statistics restaurantId={restaurantId} />
        </StaffLayout>
      )}
    </RequireRole>
  );
}