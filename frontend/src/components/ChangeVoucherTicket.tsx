import { createPortal } from 'react-dom';
import { Row, Sep, TicketFooter, TicketHeader, dateFr, ticketFont, timeShort } from './TicketParts';
import { fcfa } from '../lib/format';
import { placeLabel } from '../lib/orderPlace';
import type { CashierOrder } from '../lib/types';

// Bon de monnaie : remis au client quand la caisse n'a pas pu rendre la monnaie
export function ChangeVoucherTicket({ order, amountFcfa }: { order: CashierOrder; amountFcfa: number }) {
  const now = new Date();
  return createPortal(
    <div className="print-receipt" style={ticketFont}>
      <TicketHeader title="BON DE MONNAIE" restaurantName={order.restaurantName} />
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
        Présentez ce bon à la caisse pour récupérer votre monnaie.
      </p>
      <TicketFooter lines={['Bon à conserver', 'Merci de votre visite']} />
    </div>,
    document.body,
  );
}
