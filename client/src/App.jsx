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
          path="staff"
          element={
            <RoleRoute allowedRoles={['Staff']}>
              <PlaceholderPage title="Staff Dashboard" description="Order processing workspace for Staff." />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse"
          element={
            <RoleRoute allowedRoles={['WarehouseManager']}>
              <PlaceholderPage title="Warehouse Dashboard" description="Inventory workspace for Warehouse Manager." />
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
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
