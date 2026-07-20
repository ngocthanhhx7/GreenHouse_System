import { useEffect, useState } from 'react';

import { inventoryService } from '../../services/inventoryService.js';

export default function LowStockPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    inventoryService
      .listLowStock()
      .then((result) => setItems(result.items || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="surface">
      <h1>Cảnh báo sắp hết hàng</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Tồn</th>
              <th>Đã giữ</th>
              <th>Khả dụng</th>
              <th>Ngưỡng cảnh báo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td>{item.stockQuantity}</td>
                <td>{item.reservedQuantity}</td>
                <td>{item.availableQuantity}</td>
                <td>{item.lowStockThreshold}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="5" className="text-center text-muted">{loading ? 'Đang tải cảnh báo tồn kho...' : 'Không có sản phẩm sắp hết hàng.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
