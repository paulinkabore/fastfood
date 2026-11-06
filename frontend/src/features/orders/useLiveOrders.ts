import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ApiError } from '../../lib/api';
import { authRequest, getAccessToken, refreshSession } from '../../lib/auth';
import type { CashierOrder } from '../../lib/types';

// Les commandes du jour, rechargées dès qu'une commande est créée ou modifiée
export function useLiveOrders(restaurantId: string) {
  const [orders, setOrders] = useState<CashierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await authRequest<{ orders: CashierOrder[] }>(
        `/restaurants/${restaurantId}/cashier/orders?scope=today`,
      );
      setOrders(d.orders);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let closed = false;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadRef.current(), 300);
    };
    const poll = window.setInterval(() => void loadRef.current(), 60_000);

    const socket = io({
      path: '/api/socket.io',
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('staff:join', { restaurantId }, (res: { ok: boolean }) => {
        setLive(res.ok);
        if (res.ok) refresh();
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

    socket.on('order:created', refresh);
    socket.on('order:updated', refresh);

    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      socket.disconnect();
    };
  }, [restaurantId]);

  return { orders, loading, error, live, reload: load };
}