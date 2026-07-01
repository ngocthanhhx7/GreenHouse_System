import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { adminService } from '../../services/adminService.js';

function StatBox({ label, value }) {
  return (
    <div className="metric-box">
      <span className="text-secondary">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminService.getOverviewReport().then(setReport).catch((err) => setError(err.message));
  }, []);

  if (!report && !error) return <div className="page-center">Loading...</div>;

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Admin Dashboard</h1>
        <Link className="btn btn-outline-success" to="/admin/settings">
          Settings
        </Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {report && (
        <>
          <div className="metrics-grid mb-4">
            <StatBox label="Orders" value={report.orders?.total || 0} />
            <StatBox label="Delivered" value={report.orders?.delivered || 0} />
            <StatBox label="Paid revenue" value={`$${Number(report.revenue?.paid || 0).toFixed(2)}`} />
            <StatBox label="Refunded" value={`$${Number(report.revenue?.refunded || 0).toFixed(2)}`} />
            <StatBox label="Products" value={report.products?.total || 0} />
            <StatBox label="Low stock" value={report.inventory?.lowStock || 0} />
            <StatBox label="Open support" value={report.support?.open || 0} />
            <StatBox label="Average rating" value={Number(report.reviews?.averageRating || 0).toFixed(1)} />
          </div>
          <h2>Order Status</h2>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.orders?.byStatus || {}).map(([status, count]) => (
                  <tr key={status}>
                    <td>{status}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
