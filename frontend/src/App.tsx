import { Link, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClientMenuPage from './pages/ClientMenuPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import LoginPage from './pages/LoginPage';
import KitchenPage from './pages/KitchenPage';
import CashierPage from './pages/CashierPage';
import ServicePage from './pages/ServicePage';
import ManagerHomePage from './pages/gestion/ManagerHomePage';
import TablesPage from './pages/gestion/TablesPage';
import MenuPage from './pages/gestion/MenuPage';

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
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/gestion" element={<ManagerHomePage />} />
      <Route path="/gestion/tables" element={<TablesPage />} />
      <Route path="/gestion/menu" element={<MenuPage />} />
      <Route path="/cuisine" element={<KitchenPage />} />
      <Route path="/caisse" element={<CashierPage />} />
      <Route path="/service" element={<ServicePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}