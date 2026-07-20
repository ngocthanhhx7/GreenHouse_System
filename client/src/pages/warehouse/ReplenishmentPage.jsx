import { useEffect, useState } from 'react';

import { inventoryService } from '../../services/inventoryService.js';
import { replenishmentService } from '../../services/replenishmentService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

export default function ReplenishmentPage() {
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ inventoryId: '', quantity: 20, reason: 'Bổ sung hàng do tồn kho thấp' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [inventoryData, requestData] = await Promise.all([
        inventoryService.listLowStock(),
        replenishmentService.listWarehouseRequests(),
      ]);
      setInventory(inventoryData.items || []);
      setRequests(requestData.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().catch((err) => setError(err.message));
  }, []);

  async function createRequest(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await replenishmentService.createWarehouseRequest({
        ...form,
        quantity: Number(form.quantity),
      });
      setMessage('Đã tạo yêu cầu bổ sung hàng.');
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function receiveRequest(request) {
    setError('');
    setMessage('');
    try {
      await replenishmentService.receiveWarehouseRequest(request.id, { receivedQuantity: request.quantity });
      setMessage(`Đã nhập bổ sung cho ${request.productName}.`);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Bổ sung hàng</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <form className="admin-form compact" onSubmit={createRequest}>
        <select className="form-select" value={form.inventoryId} onChange={(event) => setForm((current) => ({ ...current, inventoryId: event.target.value }))} required>
          <option value="">Chọn sản phẩm sắp hết</option>
          {inventory.map((item) => (
            <option key={item.id} value={item.id}>
              {item.productName} ({item.availableQuantity} khả dụng / ngưỡng {item.lowStockThreshold})
            </option>
          ))}
        </select>
        <input className="form-control" type="number" min="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
        <input className="form-control" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required />
        <button className="btn btn-success" type="submit">Tạo yêu cầu</button>
      </form>
      <div className="table-responsive mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>SL</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.productName}</td>
                <td>{request.quantity}</td>
                <td>{translateRequestStatus(request.status)}</td>
                <td>
                  {request.status === 'Approved' && (
                    <button className="btn btn-outline-success btn-sm" type="button" onClick={() => receiveRequest(request)}>
                      Nhập hàng
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && !requests.length && <tr><td colSpan="4" className="text-center text-muted">Chưa có yêu cầu bổ sung hàng.</td></tr>}
            {loading && <tr><td colSpan="4" className="text-center text-muted">Đang tải yêu cầu bổ sung...</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
