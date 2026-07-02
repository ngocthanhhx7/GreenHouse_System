import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="page-center">
      <div className="surface text-center">
        <h1>Cần đăng nhập</h1>
        <p className="text-secondary">Vui lòng đăng nhập trước khi truy cập trang này.</p>
        <Link className="btn btn-success" to="/login">
          Đi tới đăng nhập
        </Link>
      </div>
    </div>
  );
}
