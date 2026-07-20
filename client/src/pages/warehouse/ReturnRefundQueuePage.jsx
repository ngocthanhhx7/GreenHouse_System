import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { returnRefundService } from '../../services/returnRefundService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

export default function ReturnRefundQueuePage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    returnRefundService.listWarehouseRequests({ status: 'AwaitingInspection' })
      .then((result) => setItems(result.items || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="surface">
      <h1>Kiểm hàng đổi trả</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Yêu cầu</th><th>Đơn hàng</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => <tr key={item.id}><td>{item.requestCode || item.id}</td><td>{item.orderCode}</td><td>{translateRequestStatus(item.status)}</td><td><Link className="btn btn-outline-success btn-sm" to={`/warehouse/return-refunds/${item.id}`}>Kiểm hàng</Link></td></tr>)}
            {!items.length && <tr><td colSpan="4" className="text-center text-muted">Không có yêu cầu chờ kiểm hàng.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
