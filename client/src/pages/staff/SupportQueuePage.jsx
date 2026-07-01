import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { supportService } from '../../services/supportService.js';

const STATUS_OPTIONS = ['', 'Open', 'InProgress', 'Resolved'];

export default function SupportQueuePage() {
  const [status, setStatus] = useState('Open');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  async function loadRequests(nextStatus = status) {
    setError('');
    try {
      const result = await supportService.listStaffRequests({ status: nextStatus });
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
        <h1>Support Queue</h1>
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
              <th>Subject</th>
              <th>Order</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.subject}</td>
                <td>{item.orderCode || '-'}</td>
                <td>{item.status}</td>
                <td>
                  <Link className="btn btn-outline-success btn-sm" to={`/staff/support-requests/${item.id}`}>
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
