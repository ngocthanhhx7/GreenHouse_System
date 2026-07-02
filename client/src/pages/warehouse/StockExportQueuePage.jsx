import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { inventoryService } from '../../services/inventoryService.js';
import { formatCurrency, translateRequestStatus } from '../../utils/formatters.js';

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
      <h1>Hàng đợi xuất kho</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Đơn hàng</th>
              <th>Trạng thái</th>
              <th>Tổng tiền</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.order?.orderCode}</td>
                <td>{translateRequestStatus(item.status)}</td>
                <td>{formatCurrency(item.order?.totalAmount)}</td>
                <td>
                  <Link className="btn btn-outline-success btn-sm" to={`/warehouse/stock-exports/${item.id}`}>
                    Mở phiếu
                  </Link>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="4" className="text-center text-muted">Chưa có phiếu xuất kho.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
