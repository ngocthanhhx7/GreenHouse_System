import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import NotificationBell from '../notifications/NotificationBell.jsx';
import { translateRole } from '../../utils/formatters.js';
import { resolveMediaUrl } from '../../services/apiClient.js';

function getInitials(user) {
  return (user?.fullName || user?.email || 'GH')
    .split(/[ @.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function InternalTopbar({ backgroundInert = false, onMenuToggle, menuOpen = false, menuButtonRef }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountButtonRef = useRef(null);
  const accountMenuRef = useRef(null);

  async function handleLogout() {
    setAccountOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }

  useEffect(() => {
    if (!accountOpen) return undefined;

    function closeAccountMenu(event) {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
        return;
      }

      if (event.type === 'mousedown' && !accountMenuRef.current?.parentElement?.contains(event.target)) {
        setAccountOpen(false);
      }
    }

    document.addEventListener('keydown', closeAccountMenu);
    document.addEventListener('mousedown', closeAccountMenu);
    return () => {
      document.removeEventListener('keydown', closeAccountMenu);
      document.removeEventListener('mousedown', closeAccountMenu);
    };
  }, [accountOpen]);

  return (
    <header
      className="internal-topbar"
      inert={backgroundInert ? true : undefined}
      aria-hidden={backgroundInert ? 'true' : undefined}
    >
      <div className="internal-brand-area">
        {onMenuToggle && (
          <button
            ref={menuButtonRef}
            className="internal-menu-button"
            type="button"
            aria-label="Mở menu vận hành"
            aria-controls="operational-sidebar"
            aria-expanded={menuOpen}
            onClick={onMenuToggle}
          >
            <span aria-hidden="true">☰</span>
          </button>
        )}
        <div className="internal-brand">
          <span className="internal-brand-icon" aria-hidden="true">⌁</span>
          <span><strong>GreenHome Kitchen</strong><small>Không gian vận hành</small></span>
        </div>
      </div>

      <div className="internal-actions">
        <NotificationBell />
        <div className="internal-profile-menu">
          <button
            ref={accountButtonRef}
            className="internal-profile"
            type="button"
            aria-label="Mở menu tài khoản"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((value) => !value)}
          >
            <span className="internal-profile-copy">
              <strong>{user?.fullName || user?.email}</strong>
              <small>{translateRole(user?.role)}</small>
            </span>
            <span className="avatar-circle">
              {user?.avatarUrl ? <img src={resolveMediaUrl(user.avatarUrl)} alt="" /> : getInitials(user)}
            </span>
          </button>

          {accountOpen && (
            <nav className="internal-account-dropdown" ref={accountMenuRef} aria-label="Điều hướng tài khoản">
              <div className="internal-account-summary">
                <strong>{user?.fullName || user?.email}</strong>
                <small>{translateRole(user?.role)}</small>
              </div>
              <Link to="/profile" onClick={() => setAccountOpen(false)}>Hồ sơ</Link>
              <Link to="/notifications" onClick={() => setAccountOpen(false)}>Thông báo</Link>
              <button type="button" onClick={handleLogout}>Đăng xuất</button>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
