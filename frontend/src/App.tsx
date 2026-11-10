import { Link, Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClientMenuPage from './pages/ClientMenuPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import LoginPage from './pages/LoginPage';
import KitchenPage from './pages/KitchenPage';
import CashierPage from './pages/CashierPage';
import ServicePage from './pages/ServicePage';
import TablesPage from './pages/gestion/TablesPage';
import DeliveryPage from './pages/gestion/DeliveryPage';
import AdminPage from './pages/admin/AdminPage';
import OrdersPage from './pages/gestion/OrdersPage';
import MenuPage from './pages/gestion/MenuPage';
import StockPage from './pages/gestion/StockPage';
import StaffPage from './pages/gestion/StaffPage';
import StatsPage from './pages/gestion/StatsPage';

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
      <Route path="/gestion" element={<Navigate to="/gestion/statistiques" replace />} />
      <Route path="/gestion/tables" element={<TablesPage />} />
      <Route path="/gestion/livraison" element={<DeliveryPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/gestion/commandes" element={<OrdersPage />} />
      <Route path="/gestion/menu" element={<MenuPage />} />
      <Route path="/gestion/stock" element={<StockPage />} />
      <Route path="/gestion/personnel" element={<StaffPage />} />
      <Route path="/gestion/statistiques" element={<StatsPage />} />
      <Route path="/cuisine" element={<KitchenPage />} />
      <Route path="/caisse" element={<CashierPage />} />
      <Route path="/serveur" element={<ServicePage />} />
      <Route path="/service" element={<Navigate to="/serveur" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}