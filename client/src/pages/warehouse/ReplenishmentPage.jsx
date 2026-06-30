import { useEffect, useState } from 'react';

import { inventoryService } from '../../services/inventoryService.js';
import { replenishmentService } from '../../services/replenishmentService.js';

export default function ReplenishmentPage() {
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ inventoryId: '', quantity: 20, reason: 'Low stock replenishment' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadData() {
    const [inventoryData, requestData] = await Promise.all([
      inventoryService.listLowStock(),
      replenishmentService.listWarehouseRequests(),
    ]);
    setInventory(inventoryData.items || []);
    setRequests(requestData.items || []);
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
      setMessage('Replenishment request created.');
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
      setMessage(`Received replenishment for ${request.productName}.`);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Replenishment</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <form className="admin-form compact" onSubmit={createRequest}>
        <select className="form-select" value={form.inventoryId} onChange={(event) => setForm((current) => ({ ...current, inventoryId: event.target.value }))} required>
          <option value="">Select low-stock product</option>
          {inventory.map((item) => (
            <option key={item.id} value={item.id}>
              {item.productName} ({item.stockQuantity}/{item.lowStockThreshold})
            </option>
          ))}
        </select>
        <input className="form-control" type="number" min="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
        <input className="form-control" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required />
        <button className="btn btn-success" type="submit">
          Create request
        </button>
      </form>
      <div className="table-responsive mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.productName}</td>
                <td>{request.quantity}</td>
                <td>{request.status}</td>
                <td>
                  {request.status === 'Approved' && (
                    <button className="btn btn-outline-success btn-sm" type="button" onClick={() => receiveRequest(request)}>
                      Receive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
