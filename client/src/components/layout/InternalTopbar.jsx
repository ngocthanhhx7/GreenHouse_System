import { Link } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';
import NotificationBell from '../notifications/NotificationBell.jsx';
import { resolveMediaUrl } from '../../services/apiClient.js';

export default function InternalTopbar() {
  const { user, logout } = useAuth();

  return (
    <header className="internal-topbar">
      <div>
        <span className="internal-kicker">GreenHome Kitchen</span>
        <strong>Không gian vận hành</strong>
      </div>
      <div className="internal-actions">
        <NotificationBell />
        <Link className="internal-profile" to="/profile">
          <span className="avatar-circle">
            {user?.avatarUrl
              ? <img src={resolveMediaUrl(user.avatarUrl)} alt="" />
              : (user?.fullName || user?.email || 'GH').slice(0, 2).toUpperCase()}
          </span>
          <span>
            <strong>{user?.fullName || user?.email}</strong>
            <small>{translateRole(user?.role)}</small>
          </span>
        </Link>
        <button className="btn btn-outline-success btn-sm" type="button" onClick={logout}>
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
