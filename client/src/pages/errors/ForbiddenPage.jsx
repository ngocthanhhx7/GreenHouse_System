import { Link } from 'react-router-dom';

export default function ForbiddenPage() {
  return (
    <div className="page-center">
      <div className="surface text-center">
        <h1>Không có quyền truy cập</h1>
        <p className="text-secondary">Vai trò hiện tại của bạn không được phép vào khu vực này.</p>
        <Link className="btn btn-success" to="/profile">
          Quay lại hồ sơ
        </Link>
      </div>
    </div>
  );
}
