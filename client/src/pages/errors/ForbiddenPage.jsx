import { Link } from 'react-router-dom';

export default function ForbiddenPage() {
  return (
    <div className="page-center">
      <div className="surface text-center">
        <h1>Forbidden</h1>
        <p className="text-secondary">Your role does not have permission to access this workspace.</p>
        <Link className="btn btn-success" to="/profile">
          Back to profile
        </Link>
      </div>
    </div>
  );
}
