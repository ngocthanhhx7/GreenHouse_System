import { Link } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';

export default function InternalTopbar() {
  const { user, logout } = useAuth();

  return (
    <header className="internal-topbar">
      <div>
        <span className="internal-kicker">GreenHome Kitchen</span>
        <strong>Không gian vận hành</strong>
      </div>
      <div className="internal-actions">
        <Link className="header-icon-btn" to="/notifications" aria-label="Thông báo">
          <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>
        <Link className="internal-profile" to="/profile">
          <span className="avatar-circle">{(user?.fullName || user?.email || 'GH').slice(0, 2).toUpperCase()}</span>
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
