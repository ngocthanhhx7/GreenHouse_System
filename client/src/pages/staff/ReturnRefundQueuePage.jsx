import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { returnRefundService } from '../../services/returnRefundService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

const STATUS_OPTIONS = ['', 'New', 'AwaitingCODReconciliation', 'Approved', 'Received', 'Rejected', 'Expired', 'Completed'];

export default function ReturnRefundQueuePage() {
  const [status, setStatus] = useState('New');
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
        <h1>Hàng đợi đổi trả / hoàn tiền</h1>
        <select className="form-select status-select" value={status} onChange={handleStatusChange}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option || 'all'} value={option}>
              {option ? translateRequestStatus(option) : 'Tất cả trạng thái'}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Đơn hàng</th>
              <th>Trạng thái</th>
              <th>Lý do</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.orderCode}</td>
                <td>{translateRequestStatus(item.status)}</td>
                <td>{item.reason}</td>
                <td>
                  <Link className="btn btn-outline-success btn-sm" to={`/staff/return-refunds/${item.id}`}>
                    Mở yêu cầu
                  </Link>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="4" className="text-center text-muted">Không có yêu cầu trong trạng thái này.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
