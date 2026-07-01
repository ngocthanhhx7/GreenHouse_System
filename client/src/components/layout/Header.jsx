import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import gsap from 'gsap';

import useAuth from '../../hooks/useAuth.js';

const PUBLIC_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/products', label: 'Products' },
  { to: '/products?collection=best-sellers', label: 'Collections' },
  { to: '/support', label: 'Support' },
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

function roleMenuLinks(role, getDashboardPath) {
  const baseLinks = [
    { to: getDashboardPath(role), label: `${role || 'User'} Dashboard` },
    { to: '/profile', label: 'Profile' },
    { to: '/notifications', label: 'Notifications' },
  ];

  if (role === 'Customer') {
    return [
      ...baseLinks,
      { to: '/orders', label: 'Order History' },
      { to: '/return-refunds', label: 'Return & Refund' },
      { to: '/support', label: 'Support Requests' },
    ];
  }

  if (role === 'Staff') {
    return [
      ...baseLinks,
      { to: '/staff/orders', label: 'Order Queue' },
      { to: '/staff/return-refunds', label: 'Return/Refund Queue' },
      { to: '/staff/support-requests', label: 'Support Queue' },
    ];
  }

  if (role === 'WarehouseManager') {
    return [
      ...baseLinks,
      { to: '/warehouse/inventory', label: 'Inventory' },
      { to: '/warehouse/stock-exports', label: 'Stock Exports' },
      { to: '/warehouse/replenishments', label: 'Replenishment' },
    ];
  }

  if (role === 'Admin') {
    return [
      ...baseLinks,
      { to: '/admin/products', label: 'Products' },
      { to: '/admin/categories', label: 'Categories' },
      { to: '/admin/audit-logs', label: 'Audit Logs' },
      { to: '/admin/settings', label: 'Settings' },
    ];
  }

  return baseLinks;
}

export default function Header() {
  const { user, logout, getDashboardPath } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const userRole = user?.role;
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    if (!menuOpen || !dropdownRef.current) return undefined;

    gsap.fromTo(
      dropdownRef.current,
      { autoAlpha: 0, y: -8, scale: 0.98 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, ease: 'power2.out' }
    );

    function closeOnOutsideClick(event) {
      if (dropdownRef.current && !dropdownRef.current.parentElement.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <Link to="/" className="brand-link" aria-label="GreenHome Kitchen home">
        <img src="/assets/logo/logo.png" alt="GreenHome Kitchen Logo" className="brand-logo" />
        <strong className="brand-name">GreenHome Kitchen</strong>
      </Link>

      <nav className="site-nav" aria-label="Primary navigation">
        {PUBLIC_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} className="site-nav-link">
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="header-actions">
        <Link to="/cart" className="header-icon-btn" aria-label="Cart">
          <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        </Link>

        {!isAuthenticated && (
          <>
            <Link to="/login" className="btn btn-outline-success btn-sm">
              Login
            </Link>
            <Link to="/register" className="btn btn-success btn-sm">
              Register
            </Link>
          </>
        )}

        {isAuthenticated && (
          <>
            <Link to="/notifications" className="header-icon-btn" aria-label="Notifications">
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
                  <small>{userRole}</small>
                </span>
              </button>
              {menuOpen && (
                <div className="avatar-dropdown" ref={dropdownRef}>
                  {roleMenuLinks(userRole, getDashboardPath).map((link) => (
                    <Link key={link.to} to={link.to} className="avatar-dropdown-link" onClick={() => setMenuOpen(false)}>
                      {link.label}
                    </Link>
                  ))}
                  <button className="avatar-dropdown-link logout" type="button" onClick={logout}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
