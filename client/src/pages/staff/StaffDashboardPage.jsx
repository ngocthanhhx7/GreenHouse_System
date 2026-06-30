import { Link } from 'react-router-dom';

export default function StaffDashboardPage() {
  return (
    <div className="surface">
      <h1>Staff Dashboard</h1>
      <div className="dashboard-actions">
        <Link className="btn btn-success" to="/staff/orders">
          Open order queue
        </Link>
      </div>
    </div>
  );
}
