import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { exchangeService } from '../../services/exchangeService.js';
import { translateExchangeStatus } from '../../utils/afterSalesLabels.js';

const STATUSES = [
  '', 'AwaitingCODReconciliation', 'CODRecoveryInProgress', 'ClosedByCODRecovery',
  'Submitted', 'AwaitingExactStockChoice',
  'WaitingForExactStock', 'ApprovedAwaitingShipment', 'CustomerShipped',
  'WarehouseInspecting', 'OutboundFulfillment', 'ReplacementShipped',
  'DeliveryIncident', 'Rejected', 'Cancelled', 'Expired',
  'ClosedNoExchange', 'ConvertedToReturnRefund', 'Completed',
];

export default function ExchangeQueuePage() {
  const [status, setStatus] = useState('Submitted');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  async function load(nextStatus = status) {
    setError('');
    try {
      const result = await exchangeService.listStaffRequests({ status: nextStatus });
      setItems(result.items || []);
    } catch (err) { setError(err.message); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Hàng đợi đổi hàng</h1>
        <select className="form-select status-select" value={status} onChange={(event) => { setStatus(event.target.value); load(event.target.value); }}>
          {STATUSES.map((item) => <option key={item || 'all'} value={item}>{item ? translateExchangeStatus(item) : 'Tất cả trạng thái'}</option>)}
        </select>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Mã yêu cầu</th><th>Trạng thái</th><th>Lý do Customer</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.requestCode}</td><td>{translateExchangeStatus(item.status)}</td><td>{item.reason}</td>
                <td><Link className="btn btn-outline-success btn-sm" to={`/staff/exchanges/${item.id}`}>Mở yêu cầu</Link></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="4" className="text-center text-muted">Không có yêu cầu.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
