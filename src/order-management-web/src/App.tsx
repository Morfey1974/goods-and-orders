import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './i18n';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { WarehousePage } from './pages/WarehousePage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { SupplierDetailPage } from './pages/SupplierDetailPage';
import { PurchaseReceiptsPage } from './pages/PurchaseReceiptsPage';
import { PurchaseReceiptDetailRoute } from './pages/PurchaseReceiptDetailPage';
import { AssembliesPage } from './pages/AssembliesPage';
import { AssemblyDetailRoute } from './pages/AssemblyDetailPage';
import { InventoryOpeningBalancePage } from './pages/InventoryOpeningBalancePage';
import { InventoryValuationPage } from './pages/InventoryValuationPage';
import { IncomeReportPage } from './pages/IncomeReportPage';
import { ExpenseReportPage } from './pages/ExpenseReportPage';
import { BusinessExpensesPage } from './pages/BusinessExpensesPage';
import { CogsReportPage } from './pages/CogsReportPage';
import { GrossProfitReportPage } from './pages/GrossProfitReportPage';
import { OperatingExpensesReportPage } from './pages/OperatingExpensesReportPage';
import { Form1342ReportPage } from './pages/Form1342ReportPage';
import { ProfitAndLossReportPage } from './pages/ProfitAndLossReportPage';
import { VendorServicesReportPage } from './pages/VendorServicesReportPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/new', element: <CustomerDetailPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'warehouse', element: <WarehousePage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'suppliers/new', element: <SupplierDetailPage /> },
      { path: 'suppliers/:id', element: <SupplierDetailPage /> },
      { path: 'purchase-receipts', element: <PurchaseReceiptsPage /> },
      { path: 'purchase-receipts/:id', element: <PurchaseReceiptDetailRoute /> },
      { path: 'assemblies', element: <AssembliesPage /> },
      { path: 'assemblies/:id', element: <AssemblyDetailRoute /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'warehouse/opening-balance', element: <InventoryOpeningBalancePage /> },
      { path: 'reports/inventory-valuation', element: <InventoryValuationPage /> },
      { path: 'reports/income', element: <IncomeReportPage /> },
      { path: 'reports/expenses', element: <ExpenseReportPage /> },
      { path: 'reports/cogs', element: <CogsReportPage /> },
      { path: 'reports/gross-profit', element: <GrossProfitReportPage /> },
      { path: 'reports/operating-expenses', element: <OperatingExpensesReportPage /> },
      { path: 'reports/form-1342', element: <Form1342ReportPage /> },
      { path: 'reports/profit-and-loss', element: <ProfitAndLossReportPage /> },
      { path: 'reports/vendor-services', element: <VendorServicesReportPage /> },
      { path: 'business-expenses', element: <BusinessExpensesPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
