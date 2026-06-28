import useAuth from '../../hooks/useAuth.js';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="surface">
      <h1>Profile</h1>
      <p className="text-secondary">Basic authenticated user profile for Phase 1.</p>
      <dl className="row mb-0">
        <dt className="col-sm-3">Email</dt>
        <dd className="col-sm-9">{user?.email}</dd>
        <dt className="col-sm-3">Role</dt>
        <dd className="col-sm-9">{user?.role}</dd>
        <dt className="col-sm-3">User ID</dt>
        <dd className="col-sm-9">{user?.id}</dd>
      </dl>
    </div>
  );
}
