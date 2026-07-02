import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { inventoryService } from '../../services/inventoryService.js';
import { formatCurrency, translateOrderStatus, translateRequestStatus } from '../../utils/formatters.js';

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
        note: `Kho cập nhật sang ${translateRequestStatus(status)}`,
      });
      setMessage(`Đã chuyển phiếu xuất kho sang ${translateRequestStatus(status)}.`);
      await loadItem();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!item && !error) return <div className="page-center">Đang tải phiếu xuất kho...</div>;

  return (
    <div className="surface">
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {item && (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">Phiếu xuất kho</span>
              <h1>{item.order?.orderCode}</h1>
              <p className="text-secondary mb-0">{translateRequestStatus(item.status)} / {translateOrderStatus(item.order?.orderStatus)}</p>
            </div>
          </div>
          <p><strong>Địa chỉ giao hàng:</strong> {item.order?.shippingAddress}</p>
          <div className="action-row">
            {item.status === 'Pending' && (
              <>
                <button className="btn btn-success" type="button" onClick={() => updateStatus('Approved')}>Duyệt xuất kho</button>
                <button className="btn btn-outline-danger" type="button" onClick={() => updateStatus('Rejected')}>Từ chối</button>
              </>
            )}
            {item.status === 'Approved' && (
              <button className="btn btn-success" type="button" onClick={() => updateStatus('Exported')}>Xác nhận đã xuất kho</button>
            )}
          </div>
          <div className="table-responsive mt-4">
            <table className="table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>SL</th>
                  <th>Tạm tính</th>
                </tr>
              </thead>
              <tbody>
                {(item.details || []).map((detail) => (
                  <tr key={detail._id || detail.id}>
                    <td>{detail.productNameSnapshot}</td>
                    <td>{detail.quantity}</td>
                    <td>{formatCurrency(detail.subtotal)}</td>
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
