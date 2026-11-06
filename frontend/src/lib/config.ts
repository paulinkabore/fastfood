import { useEffect, useState } from 'react';
import { api } from './api';

let cached: Promise<{ mobileMoney: boolean }> | null = null;

// Réglages publics lus une seule fois : le Mobile Money n'est proposé que s'il est activé sur le serveur
export function usePublicConfig() {
  const [config, setConfig] = useState({ mobileMoney: false });

  useEffect(() => {
    let cancelled = false;
    cached ??= api.getConfig().catch(() => ({ mobileMoney: false }));
    void cached.then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}