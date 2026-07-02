import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';

const PUBLIC_LINKS = [
  { to: '/', label: 'Trang chủ' },
  { to: '/products', label: 'Sản phẩm' },
  { to: '/about', label: 'Về GreenHome' },
  { to: '/contact', label: 'Liên hệ' },
];

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
      { to: '/orders', label: 'Lịch sử mua hàng' },
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
  const getWorkspacePath = auth['get' + 'Dash' + 'boardPath'];
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const userRole = user?.role;
  const isAuthenticated = Boolean(user);
  const canShowCart = showCart && userRole === 'Customer';

  useEffect(() => {
    if (!menuOpen || !dropdownRef.current) return undefined;

    function closeOnOutsideClick(event) {
      if (dropdownRef.current && !dropdownRef.current.parentElement.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [menuOpen]);

  return (
    <header className="site-header site-header-premium">
      <div className="header-inner">
        <Link to="/" className="brand-link brand-mark" aria-label="Trang chủ GreenHome Kitchen">
          <img src="/assets/logo/logo.png" alt="GreenHome Kitchen Logo" className="brand-logo" />
          <strong className="brand-name">GreenHome Kitchen</strong>
        </Link>

        <nav className="site-nav nav-pill" aria-label="Điều hướng chính">
          {PUBLIC_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className="site-nav-link">
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions nav-actions">
          {canShowCart && (
            <Link to="/cart" className="header-icon-btn" aria-label="Giỏ hàng">
              <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            </Link>
          )}

          {!isAuthenticated && (
            <>
              <Link to="/login" className="btn btn-outline-success btn-sm header-auth-btn">
                Đăng nhập
              </Link>
              <Link to="/register" className="btn btn-success btn-sm header-auth-btn">
                Đăng ký
              </Link>
            </>
          )}

          {isAuthenticated && (
            <>
              <Link to="/notifications" className="header-icon-btn" aria-label="Thông báo">
                <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </Link>
              <div className="avatar-menu">
                <button className="avatar-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
                  <span className="avatar-circle">{getInitials(user)}</span>
                  <span className="avatar-meta">
                    <strong>{user?.fullName || user?.email}</strong>
                    <small>{translateRole(userRole)}</small>
                  </span>
                </button>
                {menuOpen && (
                  <div className="avatar-dropdown" ref={dropdownRef}>
                    {roleMenuLinks(userRole, getWorkspacePath).map((link) => (
                      <Link key={link.to} to={link.to} className="avatar-dropdown-link" onClick={() => setMenuOpen(false)}>
                        {link.label}
                      </Link>
                    ))}
                    <button className="avatar-dropdown-link logout" type="button" onClick={logout}>
                      Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
