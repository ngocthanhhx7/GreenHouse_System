import { useEffect, useState } from 'react';

import { replenishmentService } from '../../services/replenishmentService.js';

export default function ReplenishmentAdminPage() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadRequests() {
    setError('');
    try {
      const result = await replenishmentService.listAdminRequests();
      setRequests(result.items || []);
    } catch (err) {
      setError(err.message);
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
        note: `${status} by admin`,
      });
      setMessage(`${status} ${request.productName}.`);
      await loadRequests();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Replenishment Approval</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <div className="table-responsive">
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
                <td className="table-actions">
                  {request.status === 'Pending' && (
                    <>
                      <button className="btn btn-outline-success btn-sm" type="button" onClick={() => decide(request, 'Approved')}>
                        Approve
                      </button>
                      <button className="btn btn-outline-danger btn-sm" type="button" onClick={() => decide(request, 'Rejected')}>
                        Reject
                      </button>
                    </>
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
