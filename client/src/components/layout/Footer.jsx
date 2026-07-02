import { Link } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';

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
            GreenHome Kitchen cung cấp dụng cụ bếp, nồi chảo và giải pháp lưu trữ thông minh cho gia đình Việt hiện đại.
          </p>
        </div>

        <div>
          <h3>Mua sắm</h3>
          <Link to="/products">Tất cả sản phẩm</Link>
          <Link to="/about">Về GreenHome</Link>
          <Link to="/contact">Liên hệ</Link>
          <Link to="/cart">Giỏ hàng</Link>
        </div>

        <div>
          <h3>Tài khoản</h3>
          <Link to={role ? getDashboardPath(role) : '/login'}>{role ? `Khu vực ${translateRole(role)}` : 'Đăng nhập'}</Link>
          <Link to="/profile">Hồ sơ</Link>
          <Link to="/notifications">Thông báo</Link>
          <Link to="/support">Hỗ trợ khách hàng</Link>
          {role === 'Customer' && <Link to="/orders">Lịch sử mua hàng</Link>}
        </div>

        <div>
          <h3>Liên hệ</h3>
          <span>greenhome.kitchen@example.com</span>
          <span>Hotline: 0900 000 004</span>
          <span>GreenHome Kitchen, Hà Nội, Việt Nam</span>
        </div>
      </div>

      <div className="footer-bottom">
        <span>&copy; {new Date().getFullYear()} GreenHome Kitchen. Đã đăng ký bản quyền.</span>
      </div>
    </footer>
  );
}
