import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
import RoleRoute from './components/auth/RoleRoute.jsx';
import ForbiddenPage from './pages/errors/ForbiddenPage.jsx';
import UnauthorizedPage from './pages/errors/UnauthorizedPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ProfilePage from './pages/profile/ProfilePage.jsx';

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
        <Route index element={<Navigate to="/profile" replace />} />
        <Route path="profile" element={<ProfilePage />} />
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
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
