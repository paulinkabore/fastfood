import { useEffect, useState } from 'react';
import { api, type PublicConfig } from './api';

let cached: Promise<PublicConfig> | null = null;

// Réglages publics lus une seule fois : le Mobile Money n'est proposé que s'il est activé sur le serveur
export function usePublicConfig() {
  const [config, setConfig] = useState<PublicConfig>({ mobileMoney: false, manualMobileMoney: null });

  useEffect(() => {
    let cancelled = false;
    cached ??= api.getConfig().catch((): PublicConfig => ({ mobileMoney: false, manualMobileMoney: null }));
    void cached.then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}