import { createPortal } from 'react-dom';
import { Row, Sep, TicketFooter, TicketHeader, TicketItems, dateFr, ticketFont, timeShort } from './TicketParts';
import { fcfa } from '../lib/format';
import { placeLabel } from '../lib/orderPlace';
import type { CashierOrder } from '../lib/types';

// Ticket de caisse « à payer » : le serveur le prend avec la commande pour le remettre au client
export function BillTicket({ order }: { order: CashierOrder }) {
  const now = new Date();
  return createPortal(
    <div className="print-receipt" style={ticketFont}>
      <TicketHeader title="TICKET DE CAISSE" restaurantName={order.restaurantName} />
      <Row left="Commande n°" right={`#${order.number}`} bold size="14px" />
      <Row left="Date" right={dateFr(now)} />
      <Row left="Heure" right={timeShort(now)} />
      <Row left="Service" right={placeLabel(order)} bold />
      {order.customerName && <Row left="Client" right={order.customerName} />}
      <Sep />
      <TicketItems items={order.items} />
      <Sep double />
      <Row left="TOTAL À PAYER" right={fcfa(order.totalFcfa)} bold size="16px" />
      <Row left="Mode de paiement" right="Espèces" />
      <Sep />
      <p style={{ textAlign: 'center', fontWeight: 700, margin: 0 }}>À RÉGLER À LA CAISSE</p>
      <TicketFooter />
    </div>,
    document.body,
  );
}
