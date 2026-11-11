import { useState, type FormEvent } from 'react';
import { Logo } from '../components/Logo';
import { BRAND_NAME } from '../lib/brand';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { landingFor } from '../lib/access';

export default function LoginPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (ready && user) return <Navigate to={landingFor(user, from)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const u = await login(email.trim(), password);
      navigate(landingFor(u, from), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inattendue, réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const field =
    'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 to-stone-50 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-8 shadow-xl shadow-stone-200/60 ring-1 ring-stone-200/70"
      >
        <div>
          <div className="flex flex-col items-center text-center">
            <Logo className="h-28" />
            <h1 className="sr-only">{BRAND_NAME}</h1>
          </div>
          <p className="mt-1 text-center text-sm text-stone-500">Connexion du personnel</p>
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-stone-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-stone-700">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </div>

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-stone-900 px-5 py-3.5 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}