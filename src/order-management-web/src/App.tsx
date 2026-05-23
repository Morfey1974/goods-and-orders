import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './i18n';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { WarehousePage } from './pages/WarehousePage';
import { OrdersPage } from './pages/OrdersPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/new" element={<CustomerDetailPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="warehouse" element={<WarehousePage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="reports" element={<PlaceholderPage titleKey="nav.reports" />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
