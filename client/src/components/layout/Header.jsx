import useAuth from '../../hooks/useAuth.js';

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <div>
        <strong>GreenHome Kitchen</strong>
        <span className="ms-2 text-secondary">Foundation/Auth Phase</span>
      </div>
      <div className="d-flex align-items-center gap-3">
        <span>{user?.email}</span>
        <button className="btn btn-outline-success btn-sm" type="button" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}
