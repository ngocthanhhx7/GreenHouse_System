import useAuth from '../../hooks/useAuth.js';
import { translateRole } from '../../utils/formatters.js';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="surface">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Tài khoản</span>
          <h1>Hồ sơ cá nhân</h1>
        </div>
      </div>
      <dl className="row mb-0">
        <dt className="col-sm-3">Email</dt>
        <dd className="col-sm-9">{user?.email}</dd>
        <dt className="col-sm-3">Vai trò</dt>
        <dd className="col-sm-9">{translateRole(user?.role)}</dd>
        <dt className="col-sm-3">Mã người dùng</dt>
        <dd className="col-sm-9">{user?.id}</dd>
      </dl>
    </div>
  );
}
