import { useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';
import { resolveMediaUrl } from '../../services/apiClient.js';

export default function InternalTopbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="internal-topbar">
      <div>
        <span className="internal-kicker">GreenHome Kitchen</span>
        <strong>Không gian vận hành</strong>
      </div>
      <div className="internal-actions">
        <div className="internal-profile">
          <span className="avatar-circle">
            {user?.avatarUrl
              ? <img src={resolveMediaUrl(user.avatarUrl)} alt="" />
              : (user?.fullName || user?.email || 'GH').slice(0, 2).toUpperCase()}
          </span>
          <span>
            <strong>{user?.fullName || user?.email}</strong>
            <small>{translateRole(user?.role)}</small>
          </span>
        </div>
        <button className="btn btn-outline-success btn-sm" type="button" onClick={handleLogout}>
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
