import type { CSSProperties, ReactNode } from 'react';
import { TicketWatermark } from './TicketWatermark';
import { BRAND_NAME, showRestaurantName } from '../lib/brand';
import { fcfa } from '../lib/format';

// Éléments communs des tickets (mise en page standard d'un ticket de caisse, police à chasse fixe)
export const ticketFont: CSSProperties = {
  fontFamily: "'Courier New', ui-monospace, monospace",
  fontSize: '12px',
  lineHeight: 1.35,
  color: '#000',
};

const center: CSSProperties = { textAlign: 'center', margin: 0 };

export function TicketHeader({ title, restaurantName }: { title: string; restaurantName?: string }) {
  return (
    <>
      <TicketWatermark />
      <p style={{ ...center, fontWeight: 700, fontSize: '15px', letterSpacing: '0.5px' }}>{BRAND_NAME}</p>
      <p style={{ ...center, fontSize: '10px' }}>BAR · CAVE À VIN · RESTAURANT</p>
      {showRestaurantName(restaurantName) && <p style={center}>{restaurantName}</p>}
      <Sep double />
      <p style={{ ...center, fontWeight: 700, fontSize: '13px', letterSpacing: '1px' }}>{title}</p>
      <Sep />
    </>
  );
}

export function Sep({ double = false }: { double?: boolean }) {
  return (
    <div
      style={{
        borderTop: double ? '3px double #000' : '1px dashed #000',
        margin: '5px 0',
        height: 0,
      }}
    />
  );
}

export function Row({
  left,
  right,
  bold = false,
  size,
}: {
  left: ReactNode;
  right?: ReactNode;
  bold?: boolean;
  size?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '8px',
        fontWeight: bold ? 700 : 400,
        fontSize: size,
      }}
    >
      <span>{left}</span>
      {right !== undefined && <span style={{ whiteSpace: 'nowrap' }}>{right}</span>}
    </div>
  );
}

export type TicketLine = {
  quantity: number;
  productName: string;
  unitPriceFcfa: number;
  options: string[];
};

// Tableau des articles : « Qté Désignation ........ Montant », option sous la ligne
export function TicketItems({ items }: { items: TicketLine[] }) {
  return (
    <>
      <Row left="QTÉ  DÉSIGNATION" right="MONTANT" bold />
      <Sep />
      {items.map((i, k) => (
        <div key={k} style={{ margin: '3px 0' }}>
          <Row left={`${i.quantity} x ${i.productName}`} right={fcfa(i.unitPriceFcfa * i.quantity)} />
          {i.quantity > 1 && <div style={{ paddingLeft: '14px', fontSize: '10px' }}>{i.quantity} × {fcfa(i.unitPriceFcfa)}</div>}
          {i.options.length > 0 && (
            <div style={{ paddingLeft: '14px', fontSize: '11px' }}>+ {i.options.join(', ')}</div>
          )}
        </div>
      ))}
      <Sep />
      <Row left="Articles" right={items.reduce((n, i) => n + i.quantity, 0)} />
    </>
  );
}

export function TicketFooter({ lines = ['Merci de votre visite', 'À bientôt !'] }: { lines?: string[] }) {
  return (
    <>
      <Sep double />
      {lines.map((l, i) => (
        <p key={i} style={{ ...center, fontWeight: i === 0 ? 700 : 400 }}>
          {l}
        </p>
      ))}
    </>
  );
}

export const dateFr = (d: Date | string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const timeShort = (d: Date | string) =>
  new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
