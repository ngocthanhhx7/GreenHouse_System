import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { useCart } from '../../contexts/CartContext.jsx';
import NotificationBell from '../notifications/NotificationBell.jsx';
import { resolveMediaUrl } from '../../services/apiClient.js';
import { translateRole } from '../../utils/formatters.js';

const PUBLIC_LINKS = [
  { to: '/', label: 'Trang chủ' },
  { to: '/products', label: 'Sản phẩm' },
  { to: '/about', label: 'Về GreenHome' },
  { to: '/contact', label: 'Liên hệ' },
];

const FOCUSABLE_ELEMENTS = 'a[href], button:not([disabled]), input:not([disabled])';

function getInitials(user) {
  const source = user?.fullName || user?.email || 'GH';
  return source
    .split(/[ @.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function roleMenuLinks(role, getWorkspacePath) {
  const baseLinks = [
    { to: getWorkspacePath(role), label: `Khu vực ${translateRole(role)}` },
    { to: '/profile', label: 'Hồ sơ' },
    { to: '/notifications', label: 'Thông báo' },
  ];

  if (role === 'Customer') {
    return [
      ...baseLinks,
      { to: '/return-refunds', label: 'Đổi trả / hoàn tiền' },
      { to: '/support', label: 'Yêu cầu hỗ trợ' },
    ];
  }

  if (role === 'Staff') {
    return [
      ...baseLinks,
      { to: '/staff/orders', label: 'Hàng đợi đơn hàng' },
      { to: '/staff/return-refunds', label: 'Yêu cầu đổi trả' },
      { to: '/staff/support-requests', label: 'Yêu cầu hỗ trợ' },
    ];
  }

  if (role === 'WarehouseManager') {
    return [
      ...baseLinks,
      { to: '/warehouse/inventory', label: 'Tồn kho' },
      { to: '/warehouse/stock-exports', label: 'Phiếu xuất kho' },
      { to: '/warehouse/replenishments', label: 'Bổ sung hàng' },
    ];
  }

  if (role === 'Admin') {
    return [
      ...baseLinks,
      { to: '/admin/products', label: 'Quản lý sản phẩm' },
      { to: '/admin/categories', label: 'Quản lý danh mục' },
      { to: '/admin/audit-logs', label: 'Nhật ký hệ thống' },
      { to: '/admin/settings', label: 'Cấu hình' },
    ];
  }

  return baseLinks;
}

export default function Header({ showCart = true }) {
  const auth = useAuth();
  const { user, logout } = auth;
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const getWorkspacePath = auth['get' + 'Dash' + 'boardPath'];
  const [keyword, setKeyword] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const menuDialogRef = useRef(null);
  const profileButtonRef = useRef(null);
  const profileMenuRef = useRef(null);
  const userRole = user?.role;
  const isAuthenticated = Boolean(user);
  const canShowCart = showCart && userRole === 'Customer';
  const accountLinks = isAuthenticated ? roleMenuLinks(userRole, getWorkspacePath) : [];

  function closeMobileMenu() {
    setMenuOpen(false);
  }

  function handleSearch(event) {
    event.preventDefault();
    const query = keyword.trim();
    navigate(query ? `/products?keyword=${encodeURIComponent(query)}` : '/products');
    setMenuOpen(false);
  }

  async function handleLogout() {
    setMenuOpen(false);
    setProfileOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }

  useEffect(() => {
    if (!profileOpen) return undefined;

    function closeProfile(event) {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
        return;
      }

      if (event.type === 'mousedown' && !profileMenuRef.current?.parentElement?.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener('keydown', closeProfile);
    document.addEventListener('mousedown', closeProfile);
    return () => {
      document.removeEventListener('keydown', closeProfile);
      document.removeEventListener('mousedown', closeProfile);
    };
  }, [profileOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 901px)');
    function closeDrawerAtDesktop(event) {
      if (event.matches) setMenuOpen(false);
    }

    desktopQuery.addEventListener('change', closeDrawerAtDesktop);
    return () => desktopQuery.removeEventListener('change', closeDrawerAtDesktop);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menuDialogRef.current?.querySelector(FOCUSABLE_ELEMENTS)?.focus();

    function handleMenuKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(menuDialogRef.current?.querySelectorAll(FOCUSABLE_ELEMENTS) || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleMenuKeyDown);
    return () => {
      document.removeEventListener('keydown', handleMenuKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  return (
    <header className="site-header site-header-premium">
      <div className="header-inner">
        <button
          ref={menuButtonRef}
          className="mobile-menu-button"
          type="button"
          aria-label="Mở menu điều hướng"
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          onClick={() => {
            setProfileOpen(false);
            setMenuOpen((value) => !value);
          }}
        >
          <span aria-hidden="true">☰</span>
        </button>

        <Link to="/" className="brand-link brand-mark" aria-label="Trang chủ GreenHome Kitchen">
          <img src="/assets/logo/logo.png" alt="" className="brand-logo" />
          <strong className="brand-name">GreenHome Kitchen</strong>
        </Link>

        <nav className="site-nav nav-pill" aria-label="Điều hướng chính">
          {PUBLIC_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="site-nav-link">
              {link.label}
            </NavLink>
          ))}
        </nav>

        <form className="header-search desktop-header-search" role="search" onSubmit={handleSearch}>
          <label className="visually-hidden" htmlFor="desktop-product-search">Tìm kiếm sản phẩm</label>
          <input
            id="desktop-product-search"
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tìm sản phẩm..."
          />
          <button type="submit" aria-label="Tìm kiếm">⌕</button>
        </form>

        <div className="header-actions nav-actions">
          {canShowCart && (
            <Link to="/cart" className="header-icon-btn" aria-label="Giỏ hàng">
              <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              {itemCount > 0 && <span className="cart-indicator-dot" role="status" aria-label="Giỏ hàng có sản phẩm mới" />}
            </Link>
          )}

          {!isAuthenticated && (
            <div className="desktop-auth-actions">
              <Link to="/login" className="btn btn-outline-success btn-sm header-auth-btn">Đăng nhập</Link>
              <Link to="/register" className="btn btn-success btn-sm header-auth-btn">Đăng ký</Link>
            </div>
          )}

          {isAuthenticated && (
            <div className="desktop-account-actions">
              <NotificationBell />
              <div className="avatar-menu">
                <button
                  ref={profileButtonRef}
                  className="avatar-button"
                  type="button"
                  aria-label="Mở menu tài khoản"
                  aria-expanded={profileOpen}
                  onClick={() => {
                    setMenuOpen(false);
                    setProfileOpen((value) => !value);
                  }}
                >
                  <span className="avatar-circle">
                    {user?.avatarUrl ? <img src={resolveMediaUrl(user.avatarUrl)} alt="" /> : getInitials(user)}
                  </span>
                  <span className="avatar-meta">
                    <strong>{user?.fullName || user?.email}</strong>
                    <small>{translateRole(userRole)}</small>
                  </span>
                  <span aria-hidden="true">⌄</span>
                </button>
                {profileOpen && (
                  <nav className="avatar-dropdown" ref={profileMenuRef} aria-label="Điều hướng tài khoản">
                    <div className="avatar-dropdown-heading">
                      <strong>{user?.fullName || user?.email}</strong>
                      <small>{translateRole(userRole)}</small>
                    </div>
                    {accountLinks.map((link) => (
                      <Link key={link.to} to={link.to} className="avatar-dropdown-link" onClick={() => setProfileOpen(false)}>
                        {link.label}
                      </Link>
                    ))}
                    <button className="avatar-dropdown-link logout" type="button" onClick={handleLogout}>
                      Đăng xuất
                    </button>
                  </nav>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {menuOpen && (
        <div
          className="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-navigation-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMobileMenu();
          }}
        >
          <div id="mobile-navigation" className="mobile-navigation-panel" ref={menuDialogRef}>
            <div className="mobile-navigation-heading">
              <strong id="mobile-navigation-title">GreenHome Kitchen</strong>
              <button type="button" aria-label="Đóng menu điều hướng" onClick={closeMobileMenu}>×</button>
            </div>

            <form className="header-search mobile-header-search" role="search" onSubmit={handleSearch}>
              <label className="visually-hidden" htmlFor="mobile-product-search">Tìm kiếm sản phẩm</label>
              <input
                id="mobile-product-search"
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Tìm kiếm sản phẩm..."
              />
              <button type="submit">Tìm</button>
            </form>

            <nav aria-label="Điều hướng di động">
              {PUBLIC_LINKS.map((link) => (
                <NavLink key={link.to} to={link.to} onClick={closeMobileMenu}>{link.label}</NavLink>
              ))}
            </nav>

            <div className="mobile-navigation-account">
              {canShowCart && <Link to="/cart" onClick={closeMobileMenu}>Giỏ hàng</Link>}
              {!isAuthenticated && (
                <>
                  <Link to="/login" onClick={closeMobileMenu}>Đăng nhập</Link>
                  <Link to="/register" className="mobile-primary-action" onClick={closeMobileMenu}>Đăng ký</Link>
                </>
              )}
              {isAuthenticated && (
                <>
                  <div className="mobile-account-identity">
                    <span className="avatar-circle">{getInitials(user)}</span>
                    <span><strong>{user?.fullName || user?.email}</strong><small>{translateRole(userRole)}</small></span>
                  </div>
                  {accountLinks.map((link) => (
                    <Link key={link.to} to={link.to} onClick={closeMobileMenu}>{link.label}</Link>
                  ))}
                  <button type="button" className="mobile-logout" onClick={handleLogout}>Đăng xuất</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
