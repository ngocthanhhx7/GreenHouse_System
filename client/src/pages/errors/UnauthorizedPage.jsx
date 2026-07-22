import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <main className="access-state-page">
      <section className="access-state-card">
        <span className="access-state-icon" aria-hidden="true">🔒</span>
        <h1>Cần đăng nhập</h1>
        <p>Vui lòng đăng nhập trước khi truy cập trang này.</p>
        <Link className="access-state-action" to="/login">
          Đi tới đăng nhập
        </Link>
      </section>
    </main>
  );
}
