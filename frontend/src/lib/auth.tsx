import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from './api';
import type { StaffUser } from './types';

// Le jeton d'accès reste en mémoire : jamais dans le stockage du navigateur
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

async function call<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifiez votre réseau.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'ERROR',
      data?.error?.message ?? `Une erreur est survenue (code ${res.status})`,
    );
  }
  return data as T;
}

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string) => {
  accessToken = token;
};

// Un seul renouvellement à la fois : les appels simultanés partagent le même résultat
export function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = call<{ accessToken: string }>('/auth/refresh', { method: 'POST' })
      .then((r) => (accessToken = r.accessToken))
      .catch(() => (accessToken = null))
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

// Appel authentifié : si le jeton a expiré, la session est renouvelée puis l'appel est refait
export async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!accessToken) await refreshSession();
  try {
    return await call<T>(path, init, accessToken);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const token = await refreshSession();
      if (token) return call<T>(path, init, token);
    }
    throw e;
  }
}

// Appel authentifié qui renvoie un fichier (image du QR code, PDF)
export async function authBlob(path: string): Promise<Blob> {
  const attempt = (token: string | null) =>
    fetch(`/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  if (!accessToken) await refreshSession();
  let res: Response;
  try {
    res = await attempt(accessToken);
    if (res.status === 401) {
      const token = await refreshSession();
      if (token) res = await attempt(token);
    }
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifiez votre réseau.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'ERROR',
      data?.error?.message ?? `Une erreur est survenue (code ${res.status})`,
    );
  }
  return res.blob();
}

type AuthContextValue = {
  user: StaffUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<StaffUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [ready, setReady] = useState(false);

  // Au chargement : on tente de rouvrir la session grâce au cookie de renouvellement
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await refreshSession();
      if (token) {
        try {
          const data = await call<{ user: StaffUser }>('/auth/me', {}, token);
          if (!cancelled) setUser(data.user);
        } catch {
          /* session invalide : le personnel devra se reconnecter */
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await call<{ accessToken: string; user: StaffUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    accessToken = data.accessToken;
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await call('/auth/logout', { method: 'POST' });
    } catch {
      /* même en cas d'échec réseau, on ferme la session côté écran */
    }
    accessToken = null;
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}