import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { inventoryService } from '../../services/inventoryService.js';

export default function StockExportDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadItem() {
    setError('');
    try {
      setItem(await inventoryService.getStockExport(id));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadItem();
  }, [id]);

  async function updateStatus(status) {
    setError('');
    setMessage('');
    try {
      await inventoryService.updateStockExportStatus(id, {
        status,
        note: `Warehouse updated to ${status}`,
      });
      setMessage(`Stock export moved to ${status}.`);
      await loadItem();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!item && !error) return <div className="page-center">Loading...</div>;

  return (
    <div className="surface">
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {item && (
        <>
          <div className="page-heading">
            <div>
              <h1>{item.order?.orderCode}</h1>
              <p className="text-secondary mb-0">{item.status} / {item.order?.orderStatus}</p>
            </div>
          </div>
          <p>{item.order?.shippingAddress}</p>
          <div className="action-row">
            {item.status === 'Pending' && (
              <>
                <button className="btn btn-success" type="button" onClick={() => updateStatus('Approved')}>
                  Approve
                </button>
                <button className="btn btn-outline-danger" type="button" onClick={() => updateStatus('Rejected')}>
                  Reject
                </button>
              </>
            )}
            {item.status === 'Approved' && (
              <button className="btn btn-success" type="button" onClick={() => updateStatus('Exported')}>
                Export stock
              </button>
            )}
          </div>
          <div className="table-responsive mt-4">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(item.details || []).map((detail) => (
                  <tr key={detail._id || detail.id}>
                    <td>{detail.productNameSnapshot}</td>
                    <td>{detail.quantity}</td>
                    <td>${Number(detail.subtotal || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
