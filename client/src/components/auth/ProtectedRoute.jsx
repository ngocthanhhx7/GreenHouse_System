import { Navigate, useLocation } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/unauthorized" replace state={{ from: location.pathname }} />;
  }

  return children;
}
