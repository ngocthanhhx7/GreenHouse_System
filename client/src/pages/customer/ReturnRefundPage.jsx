import { useEffect, useState } from 'react';

import { returnRefundService } from '../../services/returnRefundService.js';
import { formatCurrency, translateRequestStatus } from '../../utils/formatters.js';

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
      <div className="page-heading">
        <div>
          <span className="eyebrow">Sau bán hàng</span>
          <h1>Yêu cầu đổi trả / hoàn tiền</h1>
        </div>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Đơn hàng</th>
              <th>Trạng thái</th>
              <th>Số tiền hoàn</th>
              <th>Lý do</th>
              <th>Ghi chú nhân viên</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.orderCode}</td>
                <td>{translateRequestStatus(item.status)}</td>
                <td>{formatCurrency(item.refundAmount)}</td>
                <td>{item.reason}</td>
                <td>{item.staffNote || '-'}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="5" className="text-center text-muted">Chưa có yêu cầu đổi trả / hoàn tiền.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
