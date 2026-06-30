import { useEffect, useState } from 'react';

import { inventoryService } from '../../services/inventoryService.js';

export default function LowStockPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    inventoryService
      .listLowStock()
      .then((result) => setItems(result.items || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="surface">
      <h1>Low Stock Alerts</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Stock</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td>{item.stockQuantity}</td>
                <td>{item.lowStockThreshold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
