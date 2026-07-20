import { NavLink, Outlet } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import Footer from './Footer.jsx';
import Header from './Header.jsx';
import InternalTopbar from './InternalTopbar.jsx';

const ACCOUNT_LINKS = [
  { to: '/profile', label: 'Hồ sơ cá nhân' },
  { to: '/notifications', label: 'Thông báo' },
];

export default function AccountLayout() {
  const { user } = useAuth();
  const isCustomer = user?.role === 'Customer';

  return (
    <div className={`account-shell ${isCustomer ? 'customer-account' : 'internal-account'}`}>
      {isCustomer ? <Header showCart /> : <InternalTopbar />}
      <div className="account-layout">
        <aside className="account-navigation" aria-label="Cài đặt tài khoản">
          <span className="account-navigation-label">Tài khoản</span>
          <nav>
            {ACCOUNT_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to}>{link.label}</NavLink>
            ))}
          </nav>
        </aside>
        <main className="account-content">
          <Outlet />
        </main>
      </div>
      {isCustomer && <Footer />}
    </div>
  );
}
