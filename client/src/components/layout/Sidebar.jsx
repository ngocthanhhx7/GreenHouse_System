import { NavLink } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

const ROLE_LINKS = {
  Customer: [
    { to: '/profile', label: 'Profile' },
    { to: '/notifications', label: 'Notifications' },
    { to: '/cart', label: 'Cart' },
    { to: '/orders', label: 'Orders' },
    { to: '/support', label: 'Support' },
  ],
  Staff: [
    { to: '/profile', label: 'Profile' },
    { to: '/notifications', label: 'Notifications' },
    { to: '/staff', label: 'Staff Dashboard' },
    { to: '/staff/orders', label: 'Order Queue' },
    { to: '/staff/support-requests', label: 'Support Queue' },
  ],
  WarehouseManager: [
    { to: '/profile', label: 'Profile' },
    { to: '/notifications', label: 'Notifications' },
    { to: '/warehouse', label: 'Warehouse Dashboard' },
    { to: '/warehouse/inventory', label: 'Inventory' },
    { to: '/warehouse/stock-exports', label: 'Stock Exports' },
    { to: '/warehouse/low-stock', label: 'Low Stock' },
    { to: '/warehouse/replenishments', label: 'Replenishment' },
  ],
  Admin: [
    { to: '/profile', label: 'Profile' },
    { to: '/notifications', label: 'Notifications' },
    { to: '/admin', label: 'Admin Dashboard' },
    { to: '/admin/products', label: 'Products' },
    { to: '/admin/categories', label: 'Categories' },
    { to: '/admin/replenishments', label: 'Replenishments' },
    { to: '/admin/settings', label: 'Settings' },
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
