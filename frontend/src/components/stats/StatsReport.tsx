import { createPortal } from 'react-dom';
import { METHOD_LABEL, dayLong, dayShort, type Stats } from '../../features/stats/stats';
import { BRAND_NAME } from '../../lib/brand';
import { fcfa } from '../../lib/format';

const INK = '#1c1917';
const MUTED = '#78716c';
const WINE = '#7a1f2b';
const GOLD = '#c99a2e';

// Histogramme en SVG : s'imprime avec ses couleurs et reste net en PDF
function Chart({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const W = 700;
  const H = 150;
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = W / Math.max(items.length, 1);
  const step = Math.max(1, Math.ceil(items.length / 12));
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img">
      <line x1="0" y1={H} x2={W} y2={H} stroke="#d6d3d1" strokeWidth="1" />
      {items.map((it, i) => {
        const h = it.value > 0 ? Math.max((it.value / max) * (H - 14), 3) : 0;
        return (
          <g key={i}>
            <rect x={i * bw + bw * 0.12} y={H - h} width={bw * 0.76} height={h} rx="2" fill={color} />
            {it.value > 0 && bw > 14 && (
              <text x={i * bw + bw / 2} y={H - h - 3} fontSize="9" textAnchor="middle" fill={MUTED}>
                {it.value >= 1000 ? `${Math.round(it.value / 1000)}k` : it.value}
              </text>
            )}
            {i % step === 0 && (
              <text x={i * bw + bw / 2} y={H + 13} fontSize="9" textAnchor="middle" fill={MUTED}>
                {it.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '5px 6px', borderBottom: `1.5px solid ${WINE}`, fontSize: 11 };
const td: React.CSSProperties = { padding: '5px 6px', borderBottom: '1px solid #e7e5e4', fontSize: 11 };
const right: React.CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' };

function Title({ children }: { children: string }) {
  return <h2 style={{ fontSize: 14, margin: '16px 0 6px', color: WINE, breakInside: 'avoid' }}>{children}</h2>;
}

export function StatsReport({ data }: { data: Stats }) {
  const s = data.summary;
  const collected = s.collectedFcfa;
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  const kpis: [string, string, string][] = [
    ['Ventes', fcfa(s.salesFcfa), 'commandes non annulées'],
    ['Commandes', String(s.ordersCount), `panier moyen ${fcfa(s.averageBasketFcfa)}`],
    ['Encaissé', fcfa(s.collectedFcfa), `${s.collectedCount} paiement(s)`],
    ['À encaisser', fcfa(s.unpaidFcfa), `${s.unpaidCount} commande(s)`],
    ['Annulées', String(s.cancelledCount), ''],
    ['Remboursé', fcfa(s.refundedFcfa), `${s.refundedCount} remboursement(s)`],
  ];
  const bestHour = [...data.byHour].sort((a, b) => b.orders - a.orders)[0];
  const bestDay = [...data.byDay].sort((a, b) => b.salesFcfa - a.salesFcfa)[0];

  return createPortal(
    <div className="print-report" style={{ fontFamily: 'Helvetica, Arial, sans-serif', color: INK }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: `3px double ${GOLD}`, paddingBottom: 10 }}>
        <img src="/logo.png" alt="" style={{ height: 56, width: 'auto' }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{BRAND_NAME}</div>
          <div style={{ fontSize: 12, color: MUTED }}>
            Rapport de statistiques · du {fmt(data.range.from)} au {fmt(data.range.to)} ({data.range.days} jour
            {data.range.days > 1 ? 's' : ''})
          </div>
          <div style={{ fontSize: 10, color: MUTED }}>Édité le {new Date().toLocaleString('fr-FR')}</div>
        </div>
      </div>

      <Title>Résumé de la période</Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {kpis.map(([l, v, h]) => (
          <div key={l} style={{ border: '1px solid #d6d3d1', borderRadius: 8, padding: '8px 10px', breakInside: 'avoid' }}>
            <div style={{ fontSize: 10, color: MUTED }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{v}</div>
            <div style={{ fontSize: 9, color: MUTED }}>{h || ' '}</div>
          </div>
        ))}
      </div>
      {s.ordersCount > 0 && (
        <p style={{ fontSize: 11, margin: '8px 0 0', color: MUTED }}>
          {bestDay && data.range.days > 1 && bestDay.salesFcfa > 0 && (
            <>Meilleur jour : {dayLong(bestDay.date)} ({fcfa(bestDay.salesFcfa)}). </>
          )}
          {bestHour && bestHour.orders > 0 && (
            <>Heure la plus chargée : {bestHour.hour} h ({bestHour.orders} commande(s)).</>
          )}
        </p>
      )}

      {data.range.days > 1 && (
        <div style={{ breakInside: 'avoid' }}>
          <Title>Ventes par jour (FCFA)</Title>
          <Chart color={WINE} items={data.byDay.map((d) => ({ label: dayShort(d.date), value: d.salesFcfa }))} />
        </div>
      )}

      <div style={{ breakInside: 'avoid' }}>
        <Title>Commandes par heure</Title>
        <Chart color={INK} items={data.byHour.map((h) => ({ label: `${h.hour}h`, value: h.orders }))} />
      </div>

      <div style={{ breakInside: 'avoid' }}>
        <Title>Produits les plus vendus</Title>
        {data.topProducts.length === 0 ? (
          <p style={{ fontSize: 11, color: MUTED }}>Aucune vente.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Produit</th>
                <th style={{ ...th, ...right }}>Quantité</th>
                <th style={{ ...th, ...right }}>Chiffre d’affaires</th>
              </tr>
            </thead>
            <tbody>
              {data.topProducts.map((p, i) => (
                <tr key={p.productId}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{p.name}</td>
                  <td style={{ ...td, ...right }}>{p.quantity}</td>
                  <td style={{ ...td, ...right }}>{fcfa(p.revenueFcfa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ breakInside: 'avoid' }}>
        <Title>Modes de paiement</Title>
        {data.paymentMethods.length === 0 ? (
          <p style={{ fontSize: 11, color: MUTED }}>Aucun paiement.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Mode</th>
                <th style={{ ...th, ...right }}>Paiements</th>
                <th style={{ ...th, ...right }}>Montant</th>
                <th style={{ ...th, ...right }}>Part</th>
              </tr>
            </thead>
            <tbody>
              {data.paymentMethods.map((m) => (
                <tr key={m.method}>
                  <td style={td}>{METHOD_LABEL[m.method] ?? m.method}</td>
                  <td style={{ ...td, ...right }}>{m.count}</td>
                  <td style={{ ...td, ...right }}>{fcfa(m.amountFcfa)}</td>
                  <td style={{ ...td, ...right }}>
                    {collected > 0 ? `${Math.round((m.amountFcfa / collected) * 100)} %` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: 9, color: MUTED, marginTop: 18, textAlign: 'center' }}>
        {BRAND_NAME} · document généré automatiquement
      </p>
    </div>,
    document.body,
  );
}
