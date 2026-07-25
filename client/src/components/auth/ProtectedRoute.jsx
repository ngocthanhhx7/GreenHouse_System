import { Navigate, useLocation } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, sessionNotice } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page-center">Đang kiểm tra phiên đăng nhập...</div>;
  }

  if (!isAuthenticated) {
    const redirectState = {
      from: location.pathname,
      ...((sessionNotice || location.state?.message)
        ? { message: sessionNotice || location.state.message }
        : {}),
    };
    return <Navigate to="/login" replace state={redirectState} />;
  }

  return children;
}
