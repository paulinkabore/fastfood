import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { POLL_MS, REALTIME } from '../../lib/realtime';
import { ApiError } from '../../lib/api';
import { authRequest, getAccessToken, refreshSession } from '../../lib/auth';
import type { OrderView } from '../../lib/types';

const ACTIVE = ['RECEIVED', 'PREPARING', 'READY'];

// Une commande est « en cuisine » si elle a été transmise et n'est pas terminée
const inKitchen = (o: OrderView) => Boolean(o.sentToKitchenAt) && ACTIVE.includes(o.status);

const upsert = (list: OrderView[], order: OrderView) => {
  const others = list.filter((o) => o.id !== order.id);
  if (!inKitchen(order)) return others;
  return [...others, order].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
};

export function useKitchen(restaurantId: string, onNewOrder: () => void) {
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const ordersRef = useRef<OrderView[]>([]);
  const onNewRef = useRef(onNewOrder);
  useEffect(() => {
    ordersRef.current = orders;
    onNewRef.current = onNewOrder;
  });

  const load = useCallback(async () => {
    try {
      const data = await authRequest<{ orders: OrderView[] }>(
        `/restaurants/${restaurantId}/orders?scope=kitchen`,
      );
      setOrders(data.orders);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  const apply = useCallback((order: OrderView) => {
    setOrders((list) => upsert(list, order));
  }, []);

  useEffect(() => {
    let closed = false;
    void load();

    // Actualisation de secours toutes les 60 secondes
    const poll = window.setInterval(() => void load(), POLL_MS);

    if (!REALTIME) return () => window.clearInterval(poll);

    const socket = io({
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('staff:join', { restaurantId }, (res: { ok: boolean }) => {
        setLive(res.ok);
        if (res.ok) void load(); // récupère ce qui a pu arriver pendant une coupure
      });
    });

    // Le serveur coupe la connexion à l'expiration du jeton : on renouvelle puis on se reconnecte
    socket.on('disconnect', (reason) => {
      setLive(false);
      if (reason === 'io server disconnect') {
        void refreshSession().then(() => {
          if (!closed) socket.connect();
        });
      }
    });

    socket.on('connect_error', () => {
      setLive(false);
      if (!socket.active) {
        void refreshSession().then(() => {
          window.setTimeout(() => {
            if (!closed) socket.connect();
          }, 2000);
        });
      }
    });

    socket.on('order:created', ({ order }: { order: OrderView }) => {
      setOrders((list) => upsert(list, order));
      if (inKitchen(order)) onNewRef.current();
    });

    socket.on('order:updated', ({ order }: { order: OrderView }) => {
      const known = ordersRef.current.some((o) => o.id === order.id);
      setOrders((list) => upsert(list, order));
      // Commande qui vient d'arriver en cuisine sans avoir été annoncée
      if (!known && inKitchen(order)) onNewRef.current();
    });

    return () => {
      closed = true;
      window.clearInterval(poll);
      socket.disconnect();
    };
  }, [restaurantId, load]);

  return { orders, loading, error, live, apply, reload: load };
}