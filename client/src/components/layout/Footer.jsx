import { Link } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';

export default function Footer() {
  const { user, getDashboardPath } = useAuth();
  const role = user?.role;

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <Link to="/" className="brand-link footer-brand-link">
            <img src="/assets/logo/logo.png" alt="GreenHome Kitchen Logo" className="brand-logo" />
            <span className="brand-copy">
              <strong>GreenHome Kitchen</strong>
              <small>Premium kitchen goods and responsible fulfillment.</small>
            </span>
          </Link>
          <p>
            A demo-ready commerce system for cookware, tableware, smart storage, order processing, inventory, and after-sale support.
          </p>
        </div>

        <div>
          <h3>Shop</h3>
          <Link to="/products">Products</Link>
          <Link to="/products?collection=best-sellers">Collections</Link>
          <Link to="/cart">Cart</Link>
          <Link to="/support">Support</Link>
        </div>

        <div>
          <h3>Account</h3>
          <Link to={role ? getDashboardPath(role) : '/login'}>{role ? `${role} Dashboard` : 'Login'}</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/notifications">Notifications</Link>
          {role === 'Customer' && <Link to="/orders">Order History</Link>}
        </div>

        <div>
          <h3>Business Contact</h3>
          <span>greenhome.kitchen@example.com</span>
          <span>Hotline: 0900 000 004</span>
          <span>GreenHome Demo Office, Ha Noi</span>
        </div>
      </div>
    </footer>
  );
}
