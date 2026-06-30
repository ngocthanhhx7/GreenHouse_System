import { useEffect, useState } from 'react';

import { returnRefundService } from '../../services/returnRefundService.js';

export default function ReturnRefundPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  async function loadRequests() {
    setError('');
    try {
      const result = await returnRefundService.listMyRequests();
      setItems(result.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  return (
    <div className="surface">
      <h1>Return & Refund</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Refund</th>
              <th>Reason</th>
              <th>Staff note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.orderCode}</td>
                <td>{item.status}</td>
                <td>${Number(item.refundAmount || 0).toFixed(2)}</td>
                <td>{item.reason}</td>
                <td>{item.staffNote || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
