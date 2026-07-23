import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { returnRefundService } from '../../services/returnRefundService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

export default function ReturnRefundQueuePage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([returnRefundService.listWarehouseRequests(), returnRefundService.listCodRecoveryCandidates()])
      .then(([requestResult, candidateResult]) => {
        const requestItems = (requestResult.items || [])
          .filter((item) => ['Approved', 'AwaitingInspection', 'CODRecoveryInProgress'].includes(item.status))
          .map((item) => ({ ...item, source: 'RETURN_REQUEST' }));
        const requestOrderIds = new Set(requestItems.map((item) => String(item.orderId)));
        const candidateItems = (candidateResult.items || [])
          .filter((item) => !requestOrderIds.has(String(item.orderId)))
          .map((item) => ({ ...item, source: 'COD_RECOVERY', requestCode: `COD-${item.orderCode}` }));
        setItems([...requestItems, ...candidateItems]);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="surface">
      <h1>Kiểm hàng đổi trả và thu hồi COD</h1>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Yêu cầu</th><th>Đơn hàng</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => <tr key={`${item.source}-${item.id}`}><td>{item.requestCode || item.id}</td><td>{item.orderCode}</td><td>{translateRequestStatus(item.status)}</td><td><Link className="btn btn-outline-success btn-sm" to={item.source === 'COD_RECOVERY' ? `/warehouse/cod-recoveries/${item.orderId}` : `/warehouse/return-refunds/${item.id}`}>{item.status === 'CODRecoveryInProgress' ? 'Thu hồi đủ hàng' : 'Kiểm hàng'}</Link></td></tr>)}
            {!items.length && <tr><td colSpan="4" className="text-center text-muted">Không có yêu cầu chờ kiểm hàng.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
