import { Navigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

export default function RoleRoute({ allowedRoles, children }) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}
