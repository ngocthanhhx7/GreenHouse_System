import { Link } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';

export default function Footer() {
  const { user, getDashboardPath } = useAuth();
  const role = user?.role;

  return (
    <footer className="site-footer">
      <div className="footer-cta">
        <h2>Sẵn sàng nâng cấp căn bếp của bạn?</h2>
        <div>
          <Link className="btn btn-light" to="/products">Mua sắm ngay</Link>
          <Link className="btn btn-outline-light" to={role ? getDashboardPath(role) : '/register'}>
            {role ? `Khu vực ${translateRole(role)}` : 'Tạo tài khoản'}
          </Link>
        </div>
      </div>

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
          <h3>Sản phẩm</h3>
          <Link to="/">Trang chủ</Link>
          <Link to="/products">Sản phẩm</Link>
          <Link to="/cart">Giỏ hàng</Link>
          <Link to="/products">Nồi chảo cao cấp</Link>
          <Link to="/support">Hỗ trợ sau mua</Link>
        </div>

        <div>
          <h3>Về chúng tôi</h3>
          <Link to="/about">Về GreenHome</Link>
          <Link to="/contact">Liên hệ</Link>
          <Link to="/contact">Thanh toán và minh bạch</Link>
          <Link to="/products">Kệ Chén Đa Năng</Link>
          {role === 'Customer' && <Link to="/orders">Lịch sử mua hàng</Link>}
        </div>

        <div>
          <h3>Liên hệ</h3>
          <span>0856 464 980</span>
          <span>0836 456 025</span>
          <span>kitchennhas@greenhome.com</span>
          <span>GreenHome Kitchen, Hà Nội, Việt Nam</span>
        </div>
      </div>

      <div className="footer-bottom">
        <span>&copy; {new Date().getFullYear()} GreenHome Kitchen. Đã đăng ký bản quyền.</span>
      </div>
    </footer>
  );
}
