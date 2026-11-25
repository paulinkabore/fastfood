import { createPortal } from 'react-dom';
import { Row, Sep, TicketFooter, TicketHeader, dateFr, ticketFont, timeShort } from './TicketParts';
import { fcfa } from '../lib/format';
import { voucherValidUntil } from '../lib/voucher';
import { placeLabel } from '../lib/orderPlace';
import type { OrderView } from '../lib/types';

// Bon de monnaie : remis au client quand la caisse n'a pas pu rendre la monnaie
export function ChangeVoucherTicket({ order, amountFcfa, code }: { order: OrderView; amountFcfa: number; code: string | null }) {
  const now = new Date();
  return createPortal(
    <div className="print-receipt" style={ticketFont}>
      <img
        src="/logo.png"
        alt="Logo"
        style={{ display: 'block', margin: '0 auto 4px', width: '28mm', filter: 'grayscale(1)' }}
      />
      <TicketHeader title="BON DE MONNAIE" restaurantName={order.restaurantName} />
      {code && (
        <p style={{ textAlign: 'center', fontWeight: 700, fontSize: '20px', letterSpacing: '3px', margin: '0 0 4px' }}>
          N° {code}
        </p>
      )}
      <Row left="Commande n°" right={`#${order.number}`} bold size="14px" />
      <Row left="Date" right={dateFr(now)} />
      <Row left="Heure" right={timeShort(now)} />
      <Row left="Service" right={placeLabel(order)} />
      {order.customerName && <Row left="Client" right={order.customerName} />}
      <Sep double />
      <p style={{ textAlign: 'center', margin: '4px 0 0' }}>MONNAIE À RECEVOIR</p>
      <p style={{ textAlign: 'center', fontWeight: 700, fontSize: '22px', margin: '2px 0 6px' }}>
        {fcfa(amountFcfa)}
      </p>
      <Sep double />
      <p style={{ textAlign: 'center', margin: 0 }}>
        Présentez ce bon à la caisse pour récupérer votre monnaie ou le déduire d’une prochaine commande.
      </p>
      <p style={{ textAlign: 'center', fontWeight: 700, margin: '4px 0 0' }}>
        Valable jusqu’au {dateFr(voucherValidUntil(now))}
      </p>
      <TicketFooter lines={['Bon à conserver', 'Merci de votre visite']} />
    </div>,
    document.body,
  );
}
