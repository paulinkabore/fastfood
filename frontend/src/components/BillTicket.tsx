import { createPortal } from 'react-dom';
import { fcfa } from '../lib/format';
import { placeLabel } from '../lib/orderPlace';
import type { CashierOrder } from '../lib/types';

// Ticket de caisse « à payer » : le serveur le prend avec la commande pour le remettre au client
export function BillTicket({ order }: { order: CashierOrder }) {
  return createPortal(
    <div className="print-receipt" style={{ fontFamily: 'monospace', fontSize: '13px', width: '72mm' }}>
      <p style={{ textAlign: 'center', fontWeight: 700, fontSize: '16px' }}>{order.restaurantName}</p>
      <p style={{ textAlign: 'center' }}>TICKET DE CAISSE</p>
      <p style={{ textAlign: 'center', fontSize: '26px', fontWeight: 700 }}>#{order.number}</p>
      <p style={{ textAlign: 'center', fontSize: '17px', fontWeight: 700 }}>{placeLabel(order)}</p>
      {order.customerName && <p style={{ textAlign: 'center' }}>{order.customerName}</p>}
      <p style={{ textAlign: 'center' }}>
        {new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
      </p>
      <hr />
      {order.items.map((i, idx) => (
        <div key={idx} style={{ margin: '4px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span>
              {i.quantity} x {i.productName}
            </span>
            <span>{fcfa(i.unitPriceFcfa * i.quantity)}</span>
          </div>
          {i.options.length > 0 && <div>+ {i.options.join(', ')}</div>}
        </div>
      ))}
      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px' }}>
        <span>TOTAL</span>
        <span>{fcfa(order.totalFcfa)}</span>
      </div>
      <p style={{ textAlign: 'center', marginTop: '8px', fontWeight: 700 }}>À PAYER EN ESPÈCES</p>
    </div>,
    document.body,
  );
}
