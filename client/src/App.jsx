import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
import RoleRoute from './components/auth/RoleRoute.jsx';
import ForbiddenPage from './pages/errors/ForbiddenPage.jsx';
import UnauthorizedPage from './pages/errors/UnauthorizedPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ProfilePage from './pages/profile/ProfilePage.jsx';
import HomePage from './pages/public/HomePage.jsx';
import ProductListingPage from './pages/public/ProductListingPage.jsx';
import ProductDetailPage from './pages/public/ProductDetailPage.jsx';
import ProductManagementPage from './pages/admin/ProductManagementPage.jsx';
import CategoryManagementPage from './pages/admin/CategoryManagementPage.jsx';
import CartPage from './pages/customer/CartPage.jsx';
import CheckoutPage from './pages/customer/CheckoutPage.jsx';
import OrderHistoryPage from './pages/customer/OrderHistoryPage.jsx';
import OrderDetailPage from './pages/customer/OrderDetailPage.jsx';
import PaymentPage from './pages/customer/PaymentPage.jsx';
import PaymentResultPage from './pages/customer/PaymentResultPage.jsx';
import SupportPage from './pages/customer/SupportPage.jsx';
import StaffDashboardPage from './pages/staff/StaffDashboardPage.jsx';
import StaffOrderQueuePage from './pages/staff/StaffOrderQueuePage.jsx';
import StaffOrderDetailPage from './pages/staff/StaffOrderDetailPage.jsx';
import InvoicePrintPage from './pages/staff/InvoicePrintPage.jsx';
import SupportQueuePage from './pages/staff/SupportQueuePage.jsx';
import SupportDetailPage from './pages/staff/SupportDetailPage.jsx';
import WarehouseDashboardPage from './pages/warehouse/WarehouseDashboardPage.jsx';
import InventoryListPage from './pages/warehouse/InventoryListPage.jsx';
import LowStockPage from './pages/warehouse/LowStockPage.jsx';
import StockExportQueuePage from './pages/warehouse/StockExportQueuePage.jsx';
import StockExportDetailPage from './pages/warehouse/StockExportDetailPage.jsx';
import ReplenishmentPage from './pages/warehouse/ReplenishmentPage.jsx';
import ReplenishmentAdminPage from './pages/admin/ReplenishmentAdminPage.jsx';

function PlaceholderPage({ title, description }) {
  return (
    <div className="surface">
      <h1>{title}</h1>
      <p className="text-secondary mb-0">{description}</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/products" element={<ProductListingPage />} />
      <Route path="/products/:id" element={<ProductDetailPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="cart"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <CartPage />
            </RoleRoute>
          }
        />
        <Route
          path="checkout"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <CheckoutPage />
            </RoleRoute>
          }
        />
        <Route
          path="orders"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <OrderHistoryPage />
            </RoleRoute>
          }
        />
        <Route
          path="orders/:id"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <OrderDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="orders/:id/payment"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <PaymentPage />
            </RoleRoute>
          }
        />
        <Route
          path="payments/result/:id"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <PaymentResultPage />
            </RoleRoute>
          }
        />
        <Route
          path="support"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <SupportPage />
            </RoleRoute>
          }
        />
        <Route
          path="staff"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <StaffDashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/orders"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <StaffOrderQueuePage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/orders/:id"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <StaffOrderDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/orders/:id/invoice"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <InvoicePrintPage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/support-requests"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <SupportQueuePage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/support-requests/:id"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <SupportDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <WarehouseDashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/inventory"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <InventoryListPage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/low-stock"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <LowStockPage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/stock-exports"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <StockExportQueuePage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/stock-exports/:id"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <StockExportDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/replenishments"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <ReplenishmentPage />
            </RoleRoute>
          }
        />
        <Route
          path="admin"
          element={
            <RoleRoute allowedRoles={['Admin']}>
              <PlaceholderPage title="Admin Dashboard" description="System management workspace for Admin." />
            </RoleRoute>
          }
        />
        <Route
          path="admin/products"
          element={
            <RoleRoute allowedRoles={['Admin']}>
              <ProductManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="admin/categories"
          element={
            <RoleRoute allowedRoles={['Admin']}>
              <CategoryManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="admin/replenishments"
          element={
            <RoleRoute allowedRoles={['Admin']}>
              <ReplenishmentAdminPage />
            </RoleRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
