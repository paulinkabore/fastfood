export type Stats = {
  range: { from: string; to: string; days: number };
  summary: {
    ordersCount: number;
    salesFcfa: number;
    averageBasketFcfa: number;
    unpaidFcfa: number;
    unpaidCount: number;
    cancelledCount: number;
    collectedFcfa: number;
    collectedCount: number;
    refundedFcfa: number;
    refundedCount: number;
  };
  paymentMethods: { method: string; amountFcfa: number; count: number }[];
  byDay: { date: string; orders: number; salesFcfa: number }[];
  byHour: { hour: number; orders: number; salesFcfa: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenueFcfa: number }[];
};

export type PresetId = 'today' | '7d' | '30d' | 'month' | 'custom';

// Les jours sont en UTC, comme sur le serveur (identique à l'heure du Burkina Faso)
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const todayYmd = () => ymd(new Date());

export const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export function presetRange(id: Exclude<PresetId, 'custom'>) {
  const to = todayYmd();
  switch (id) {
    case 'today':
      return { from: to, to };
    case '7d':
      return { from: addDays(to, -6), to };
    case '30d':
      return { from: addDays(to, -29), to };
    case 'month':
      return { from: `${to.slice(0, 8)}01`, to };
  }
}

export const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Aujourd’hui' },
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: 'month', label: 'Ce mois' },
];

export const dayShort = (s: string) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });

export const dayLong = (s: string) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

export const METHOD_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte',
};