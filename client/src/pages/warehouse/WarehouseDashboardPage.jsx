import { Link } from 'react-router-dom';

export default function WarehouseDashboardPage() {
  return (
    <div className="surface">
      <h1>Warehouse Dashboard</h1>
      <div className="dashboard-actions">
        <Link className="btn btn-success" to="/warehouse/inventory">
          Inventory
        </Link>
        <Link className="btn btn-outline-success" to="/warehouse/stock-exports">
          Stock export queue
        </Link>
        <Link className="btn btn-outline-success" to="/warehouse/low-stock">
          Low stock
        </Link>
      </div>
    </div>
  );
}
