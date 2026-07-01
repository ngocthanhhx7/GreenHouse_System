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
            <strong className="brand-name">GreenHome Kitchen</strong>
          </Link>
          <p>
            Your trusted source for premium kitchenware, cookware, and smart storage solutions.
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
          <h3>Contact</h3>
          <span>contact@greenhomekitchen.com</span>
          <span>Hotline: 0900 000 004</span>
          <span>GreenHome Kitchen Co., Ha Noi, Vietnam</span>
        </div>
      </div>

      <div className="footer-bottom">
        <span>&copy; {new Date().getFullYear()} GreenHome Kitchen. All rights reserved.</span>
      </div>
    </footer>
  );
}
