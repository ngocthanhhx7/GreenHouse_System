import { useEffect, useState } from 'react';

import { replenishmentService } from '../../services/replenishmentService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

export default function ReplenishmentAdminPage() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadRequests() {
    setError('');
    setLoading(true);
    try {
      const result = await replenishmentService.listAdminRequests();
      setRequests(result.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function decide(request, status) {
    setError('');
    setMessage('');
    try {
      await replenishmentService.updateAdminStatus(request.id, {
        status,
        note: `${translateRequestStatus(status)} bởi quản trị viên`,
      });
      setMessage(`${translateRequestStatus(status)} yêu cầu cho ${request.productName}.`);
      await loadRequests();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Duyệt bổ sung hàng</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <div className="table-responsive">
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
                <td className="table-actions">
                  {request.status === 'PendingApproval' && (
                    <>
                      <button className="btn btn-outline-success btn-sm" type="button" onClick={() => decide(request, 'Approved')}>
                        Duyệt
                      </button>
                      <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => decide(request, 'Rejected')}>
                        Từ chối
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!loading && !requests.length && <tr><td colSpan="4" className="text-center text-muted">Chưa có yêu cầu chờ duyệt.</td></tr>}
            {loading && <tr><td colSpan="4" className="text-center text-muted">Đang tải yêu cầu bổ sung...</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
