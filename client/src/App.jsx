import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout.jsx';
import CustomerLayout from './components/layout/CustomerLayout.jsx';
import AccountLayout from './components/layout/AccountLayout.jsx';
import PublicLayout from './components/layout/PublicLayout.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
import RoleRoute from './components/auth/RoleRoute.jsx';
import ForbiddenPage from './pages/errors/ForbiddenPage.jsx';
import UnauthorizedPage from './pages/errors/UnauthorizedPage.jsx';
import NotificationPage from './pages/notifications/NotificationPage.jsx';
import NotificationDetailPage from './pages/notifications/NotificationDetailPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx';
import AcceptInvitationPage from './pages/auth/AcceptInvitationPage.jsx';
import ProfilePage from './pages/profile/ProfilePage.jsx';
import HomePage from './pages/public/HomePage.jsx';
import ProductListingPage from './pages/public/ProductListingPage.jsx';
import ProductDetailPage from './pages/public/ProductDetailPage.jsx';
import AboutPage from './pages/public/AboutPage.jsx';
import ContactPage from './pages/public/ContactPage.jsx';
import AdminDashboardPage from './pages/admin/AdminDashboardPage.jsx';
import AuditLogPage from './pages/admin/AuditLogPage.jsx';
import ProductManagementPage from './pages/admin/ProductManagementPage.jsx';
import CategoryManagementPage from './pages/admin/CategoryManagementPage.jsx';
import SystemSettingsPage from './pages/admin/SystemSettingsPage.jsx';
import CartPage from './pages/customer/CartPage.jsx';
import CheckoutPage from './pages/customer/CheckoutPage.jsx';
import OrderHistoryPage from './pages/customer/OrderHistoryPage.jsx';
import OrderDetailPage from './pages/customer/OrderDetailPage.jsx';
import PaymentPage from './pages/customer/PaymentPage.jsx';
import PaymentResultPage from './pages/customer/PaymentResultPage.jsx';
import ReturnRefundPage from './pages/customer/ReturnRefundPage.jsx';
import ExchangeListPage from './pages/customer/ExchangeListPage.jsx';
import CustomerExchangeDetailPage from './pages/customer/ExchangeDetailPage.jsx';
import SupportPage from './pages/customer/SupportPage.jsx';
import ReviewManagementPage from './pages/customer/ReviewManagementPage.jsx';
import StaffDashboardPage from './pages/staff/StaffDashboardPage.jsx';
import StaffOrderQueuePage from './pages/staff/StaffOrderQueuePage.jsx';
import StaffOrderDetailPage from './pages/staff/StaffOrderDetailPage.jsx';
import InvoicePrintPage from './pages/staff/InvoicePrintPage.jsx';
import ReturnRefundQueuePage from './pages/staff/ReturnRefundQueuePage.jsx';
import ReturnRefundDetailPage from './pages/staff/ReturnRefundDetailPage.jsx';
import ExchangeQueuePage from './pages/staff/ExchangeQueuePage.jsx';
import StaffExchangeDetailPage from './pages/staff/ExchangeDetailPage.jsx';
import SupportQueuePage from './pages/staff/SupportQueuePage.jsx';
import SupportDetailPage from './pages/staff/SupportDetailPage.jsx';
import StaffDamageReportsPage from './pages/staff/DamageReportsPage.jsx';
import ReviewModerationPage from './pages/staff/ReviewModerationPage.jsx';
import WarehouseDashboardPage from './pages/warehouse/WarehouseDashboardPage.jsx';
import InventoryListPage from './pages/warehouse/InventoryListPage.jsx';
import LowStockPage from './pages/warehouse/LowStockPage.jsx';
import StockExportQueuePage from './pages/warehouse/StockExportQueuePage.jsx';
import StockExportDetailPage from './pages/warehouse/StockExportDetailPage.jsx';
import ReturnedParcelQueuePage from './pages/warehouse/ReturnedParcelQueuePage.jsx';
import ReplenishmentPage from './pages/warehouse/ReplenishmentPage.jsx';
import WarehouseReturnRefundQueuePage from './pages/warehouse/ReturnRefundQueuePage.jsx';
import ReturnRefundInspectionPage from './pages/warehouse/ReturnRefundInspectionPage.jsx';
import WarehouseExchangeQueuePage from './pages/warehouse/ExchangeQueuePage.jsx';
import ExchangeInspectionPage from './pages/warehouse/ExchangeInspectionPage.jsx';
import ReplenishmentAdminPage from './pages/admin/ReplenishmentAdminPage.jsx';
import WarehouseDamageReportsPage from './pages/warehouse/DamageReportsPage.jsx';
import AccountManagementPage from './pages/admin/AccountManagementPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="products" element={<ProductListingPage />} />
        <Route path="products/:id" element={<ProductDetailPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="accept-invitation" element={<AcceptInvitationPage />} />
        <Route path="unauthorized" element={<UnauthorizedPage />} />
        <Route path="forbidden" element={<ForbiddenPage />} />
      </Route>

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AccountLayout />
          </ProtectedRoute>
        }
      >
        <Route path="profile" element={<ProfilePage />} />
        <Route path="notifications" element={<NotificationPage />} />
        <Route path="notifications/:id" element={<NotificationDetailPage />} />
      </Route>

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <CustomerLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="reviews"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <ReviewManagementPage />
            </RoleRoute>
          }
        />
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
          path="return-refunds"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <ReturnRefundPage />
            </RoleRoute>
          }
        />
        <Route
          path="exchanges"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <ExchangeListPage />
            </RoleRoute>
          }
        />
        <Route
          path="exchanges/:id"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <CustomerExchangeDetailPage />
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
          path="support/:ticketId"
          element={
            <RoleRoute allowedRoles={['Customer']}>
              <SupportPage />
            </RoleRoute>
          }
        />
      </Route>

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
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
          path="staff/return-refunds"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <ReturnRefundQueuePage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/exchanges"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <ExchangeQueuePage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/exchanges/:id"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <StaffExchangeDetailPage />
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
          path="staff/return-refunds/:id"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <ReturnRefundDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/support-requests/:ticketId"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <SupportDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/damage-reports"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <StaffDamageReportsPage />
            </RoleRoute>
          }
        />
        <Route
          path="staff/reviews"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <ReviewModerationPage />
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
          path="warehouse/damage-reports"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <WarehouseDamageReportsPage />
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
          path="warehouse/returned-parcels"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <ReturnedParcelQueuePage />
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
          path="warehouse/return-refunds"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <WarehouseReturnRefundQueuePage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/exchanges"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <WarehouseExchangeQueuePage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/exchanges/:id"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <ExchangeInspectionPage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/return-refunds/:id"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <ReturnRefundInspectionPage />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse/cod-recoveries/:id"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <ReturnRefundInspectionPage />
            </RoleRoute>
          }
        />
        <Route
          path="admin"
          element={
            <RoleRoute allowedRoles={['Admin']}>
              <AdminDashboardPage />
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
          path="admin/audit-logs"
          element={
            <RoleRoute allowedRoles={['Admin']}>
              <AuditLogPage />
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
        <Route
          path="admin/settings"
          element={
            <RoleRoute allowedRoles={['Admin']}>
              <SystemSettingsPage />
            </RoleRoute>
          }
        />
        <Route
          path="admin/accounts"
          element={
            <RoleRoute allowedRoles={['Admin']}>
              <AccountManagementPage />
            </RoleRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
