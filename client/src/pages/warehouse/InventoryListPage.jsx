import { useEffect, useState } from 'react';

import { inventoryService } from '../../services/inventoryService.js';

export default function InventoryListPage() {
  const [inventory, setInventory] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadInventory() {
    setError('');
    setLoading(true);
    try {
      const result = await inventoryService.listInventory();
      setInventory(result.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  async function adjustStock(item, delta) {
    setError('');
    setMessage('');
    try {
      await inventoryService.adjustInventory(item.id, {
        delta,
        reason: delta > 0 ? 'Nhập bù thủ công từ kho' : 'Điều chỉnh giảm thủ công từ kho',
      });
      setMessage(`Đã cập nhật tồn kho cho ${item.productName}.`);
      await loadInventory();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Tồn kho</h1>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Tồn</th>
              <th>Đã giữ</th>
              <th>Khả dụng</th>
              <th>Hỏng</th>
              <th>Ngưỡng cảnh báo</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td>{item.stockQuantity}</td>
                <td>{item.reservedQuantity}</td>
                <td>{item.availableQuantity}</td>
                <td>{item.damagedQuantity}</td>
                <td>{item.lowStockThreshold}</td>
                <td>{item.isLowStock ? 'Sắp hết hàng' : 'Ổn định'}</td>
                <td className="table-actions">
                  <button className="btn btn-outline-success btn-sm" type="button" onClick={() => adjustStock(item, 1)}>+1</button>
                  <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => adjustStock(item, -1)}>-1</button>
                </td>
              </tr>
            ))}
            {!loading && !inventory.length && (
              <tr><td colSpan="8" className="text-center text-muted">Chưa có bản ghi tồn kho.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
