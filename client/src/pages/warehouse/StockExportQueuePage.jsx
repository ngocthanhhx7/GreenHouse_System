import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { inventoryService } from '../../services/inventoryService.js';
import { formatCurrency, translateRequestStatus } from '../../utils/formatters.js';

export default function StockExportQueuePage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    inventoryService.listStockExports()
      .then((result) => setItems(result.items || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="surface">
      <div className="page-heading">
        <div><span className="eyebrow">Warehouse</span><h1>Hàng đợi xuất kho chính xác</h1></div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Đơn hàng</th><th>Cycle / request</th><th>Trạng thái</th><th>Tổng tiền</th><th /></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.order?.orderCode}</td>
                <td>{item.cycleId || item.requestKind} / {item.id}</td>
                <td>{translateRequestStatus(item.status)}</td>
                <td>{formatCurrency(item.order?.totalAmount)}</td>
                <td><Link className="btn btn-outline-success btn-sm" to={`/warehouse/stock-exports/${item.id}`}>Mở phiếu</Link></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="5" className="text-center text-muted">{loading ? 'Đang tải…' : 'Chưa có phiếu.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
