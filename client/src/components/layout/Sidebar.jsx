import { NavLink } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

const ROLE_LINKS = {
  Customer: [{ to: '/profile', label: 'Profile' }],
  Staff: [
    { to: '/profile', label: 'Profile' },
    { to: '/staff', label: 'Staff Dashboard' },
  ],
  WarehouseManager: [
    { to: '/profile', label: 'Profile' },
    { to: '/warehouse', label: 'Warehouse Dashboard' },
  ],
  Admin: [
    { to: '/profile', label: 'Profile' },
    { to: '/admin', label: 'Admin Dashboard' },
    { to: '/admin/products', label: 'Products' },
    { to: '/admin/categories', label: 'Categories' },
  ],
};

export default function Sidebar() {
  const { user } = useAuth();
  const links = ROLE_LINKS[user?.role] || ROLE_LINKS.Customer;

  return (
    <aside className="app-sidebar">
      <div className="sidebar-title">{user?.role || 'User'}</div>
      <nav className="nav flex-column gap-1">
        {links.map((link) => (
          <NavLink key={link.to} className="nav-link" to={link.to}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
