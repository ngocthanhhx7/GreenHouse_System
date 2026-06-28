import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="page-center">
      <div className="surface text-center">
        <h1>Unauthorized</h1>
        <p className="text-secondary">Please login before accessing this page.</p>
        <Link className="btn btn-success" to="/login">
          Go to login
        </Link>
      </div>
    </div>
  );
}
