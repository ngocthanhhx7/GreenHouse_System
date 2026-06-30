import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { returnRefundService } from '../../services/returnRefundService.js';

const STATUS_OPTIONS = ['', 'Pending', 'Approved', 'Rejected'];

export default function ReturnRefundQueuePage() {
  const [status, setStatus] = useState('Pending');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  async function loadRequests(nextStatus = status) {
    setError('');
    try {
      const result = await returnRefundService.listStaffRequests({ status: nextStatus });
      setItems(result.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  function handleStatusChange(event) {
    const nextStatus = event.target.value;
    setStatus(nextStatus);
    loadRequests(nextStatus);
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Return & Refund Queue</h1>
        <select className="form-select status-select" value={status} onChange={handleStatusChange}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option || 'all'} value={option}>
              {option || 'All statuses'}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Refund</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.orderCode}</td>
                <td>{item.status}</td>
                <td>${Number(item.refundAmount || 0).toFixed(2)}</td>
                <td>{item.reason}</td>
                <td>
                  <Link className="btn btn-outline-success btn-sm" to={`/staff/return-refunds/${item.id}`}>
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
