import { Link, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClientMenuPage from './pages/ClientMenuPage';
import OrderTrackingPage from './pages/OrderTrackingPage';

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-5xl font-semibold text-brand-500">404</p>
        <p className="mt-2 text-stone-500">Cette page n'existe pas.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-600">
          Retour à l'accueil
        </Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/q/:token" element={<ClientMenuPage />} />
      <Route path="/commande/:orderId" element={<OrderTrackingPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}