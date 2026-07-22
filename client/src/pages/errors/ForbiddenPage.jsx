import { Link } from 'react-router-dom';

export default function ForbiddenPage() {
  return (
    <main className="access-state-page">
      <section className="access-state-card">
        <span className="access-state-icon" aria-hidden="true">🛡️</span>
        <h1>Không có quyền truy cập</h1>
        <p>Vai trò hiện tại của bạn không được phép vào khu vực này.</p>
        <Link className="access-state-action" to="/profile">
          Quay lại hồ sơ
        </Link>
      </section>
    </main>
  );
}
