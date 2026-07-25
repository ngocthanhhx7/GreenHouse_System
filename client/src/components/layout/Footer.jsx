import { Link } from 'react-router-dom';

const DISCOVERY_LINKS = [
  { to: '/', label: 'Trang chủ' },
  { to: '/products', label: 'Sản phẩm' },
  { to: '/about', label: 'Về GreenHome' },
  { to: '/contact', label: 'Liên hệ' },
];

const SUPPORT_LINKS = [
  { to: '/contact#contact-form', label: 'Liên hệ hỗ trợ' },
  { to: '/#quy-trinh-mua-hang', label: 'Quy trình mua hàng' },
  { to: '/login', label: 'Đăng nhập tài khoản' },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <section className="footer-brand" aria-labelledby="footer-brand-title">
          <Link to="/" className="brand-link footer-brand-link">
            <img src="/assets/logo/logo.png" alt="" className="brand-logo" />
            <strong id="footer-brand-title" className="brand-name">GreenHome Kitchen</strong>
          </Link>
          <p>Dụng cụ bếp được tuyển chọn cho gia đình Việt hiện đại.</p>
        </section>

        <nav className="footer-column" aria-labelledby="footer-discovery-title">
          <h3 id="footer-discovery-title">Khám phá</h3>
          {DISCOVERY_LINKS.map((link) => <Link key={link.to} to={link.to}>{link.label}</Link>)}
        </nav>

        <nav className="footer-column" aria-labelledby="footer-support-title">
          <h3 id="footer-support-title">Hỗ trợ</h3>
          {SUPPORT_LINKS.map((link) => <Link key={link.to} to={link.to}>{link.label}</Link>)}
        </nav>

        <address className="footer-column footer-contact" aria-labelledby="footer-contact-title">
          <h3 id="footer-contact-title">Liên hệ</h3>
          <a href="tel:+84856464980"><span aria-hidden="true">☎</span> 0856 464 980</a>
          <a href="mailto:kitchennhas@greenhome.com"><span aria-hidden="true">✉</span> kitchennhas@greenhome.com</a>
          <span><span aria-hidden="true">⌖</span> Hà Nội, Việt Nam</span>
        </address>
      </div>

      <div className="footer-bottom">
        <span>&copy; {new Date().getFullYear()} GreenHome Kitchen. Đã đăng ký bản quyền.</span>
      </div>
    </footer>
  );
}
