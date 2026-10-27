import { useEffect, useState } from 'react';

type Health = { status: string; timestamp: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-stone-200/60 ring-1 ring-stone-200">
        <h1 className="text-2xl font-semibold tracking-tight">
          Fast-Food <span className="text-brand-500">QR</span>
        </h1>
        <p className="mt-1 text-sm text-stone-500">Vérification de la connexion à l'API</p>

        <div className="mt-6 flex items-center gap-3 rounded-xl bg-stone-50 p-4">
          <span
            className={`h-3 w-3 rounded-full ${
              health ? 'bg-emerald-500' : error ? 'bg-red-500' : 'bg-stone-300 animate-pulse'
            }`}
          />
          <span className="text-sm font-medium">
            {health ? 'API connectée' : error ? 'API injoignable' : 'Connexion…'}
          </span>
        </div>
      </div>
    </main>
  );
}