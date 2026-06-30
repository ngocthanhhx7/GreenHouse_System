import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { inventoryService } from '../../services/inventoryService.js';

export default function StockExportQueuePage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    inventoryService
      .listStockExports()
      .then((result) => setItems(result.items || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="surface">
      <h1>Stock Export Queue</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.order?.orderCode}</td>
                <td>{item.status}</td>
                <td>${Number(item.order?.totalAmount || 0).toFixed(2)}</td>
                <td>
                  <Link className="btn btn-outline-success btn-sm" to={`/warehouse/stock-exports/${item.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
