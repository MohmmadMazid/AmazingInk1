import { Routes, Route, Navigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import LoginScreen from './features/auth/LoginScreen.jsx';
import ProductsScreen from './features/products/ProductsScreen.jsx';
import OrdersScreen from './features/orders/OrdersScreen.jsx';
import CustomersScreen from './features/customers/CustomersScreen.jsx';
import InventoryScreen from './features/inventory/InventoryScreen.jsx';
import PricingScreen from './features/pricing/PricingScreen.jsx';
import ShippingScreen from './features/shipping/ShippingScreen.jsx';
import WarehouseScreen from './features/warehouse/WarehouseScreen.jsx';
import ListingsScreen from './features/listings/ListingsScreen.jsx';
import ChannelsScreen from './features/channels/ChannelsScreen.jsx';
import ImportScreen from './features/imports/ImportScreen.jsx';
import AnalyticsScreen from './features/analytics/AnalyticsScreen.jsx';
import NotificationsScreen from './features/notifications/NotificationsScreen.jsx';
import AdminScreen from './features/admin/AdminScreen.jsx';
import SearchScreen from './features/search/SearchScreen.jsx';
import AutomationScreen from './features/automation/AutomationScreen.jsx';
import SecurityScreen from './features/security/SecurityScreen.jsx';
import AiScreen from './features/ai/AiScreen.jsx';
import DeveloperScreen from './features/developer/DeveloperScreen.jsx';

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><CircularProgress /></Box>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/products" element={<Protected><ProductsScreen /></Protected>} />
      <Route path="/orders" element={<Protected><OrdersScreen /></Protected>} />
      <Route path="/customers" element={<Protected><CustomersScreen /></Protected>} />
      <Route path="/inventory" element={<Protected><InventoryScreen /></Protected>} />
      <Route path="/pricing" element={<Protected><PricingScreen /></Protected>} />
      <Route path="/shipping" element={<Protected><ShippingScreen /></Protected>} />
      <Route path="/warehouse" element={<Protected><WarehouseScreen /></Protected>} />
      <Route path="/listings" element={<Protected><ListingsScreen /></Protected>} />
      <Route path="/channels" element={<Protected><ChannelsScreen /></Protected>} />
      <Route path="/import" element={<Protected><ImportScreen /></Protected>} />
      <Route path="/analytics" element={<Protected><AnalyticsScreen /></Protected>} />
      <Route path="/notifications" element={<Protected><NotificationsScreen /></Protected>} />
      <Route path="/admin" element={<Protected><AdminScreen /></Protected>} />
      <Route path="/search" element={<Protected><SearchScreen /></Protected>} />
      <Route path="/automation" element={<Protected><AutomationScreen /></Protected>} />
      <Route path="/security" element={<Protected><SecurityScreen /></Protected>} />
      <Route path="/ai" element={<Protected><AiScreen /></Protected>} />
      <Route path="/developer" element={<Protected><DeveloperScreen /></Protected>} />
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  );
}
