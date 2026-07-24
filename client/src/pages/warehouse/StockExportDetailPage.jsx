import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { inventoryService } from '../../services/inventoryService.js';
import { formatCurrency, translateOrderStatus, translateRequestStatus } from '../../utils/formatters.js';

function key() {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `stock-export:${random}`;
}

export default function StockExportDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const commandKey = useRef(key());

  async function loadItem() {
    setError('');
    try {
      setItem(await inventoryService.getStockExport(id));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadItem(); }, [id]);

  async function processExactExport() {
    if (processing) return;
    setProcessing(true);
    setError('');
    setMessage('');
    try {
      const result = await inventoryService.processStockExport(id, {
        idempotencyKey: commandKey.current,
      });
      const replay = result.idempotentReplay || result.replay;
      setMessage(replay
        ? 'AlreadyProcessed: kết quả Completed đã tồn tại, không trừ kho lần nữa.'
        : 'Đã xuất chính xác toàn bộ đơn. Staff sẽ xác nhận packing riêng.');
      await loadItem();
    } catch (err) {
      setError(err.message);
      await loadItem();
    } finally {
      setProcessing(false);
    }
  }

  if (!item && !error) return <div className="page-center">Đang tải phiếu xuất kho...</div>;
  const commandStatus = processing ? 'Processing' : item?.status;

  return (
    <div className="surface">
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {item && (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">Exact stock export</span>
              <h1>{item.order?.orderCode}</h1>
              <p className="text-secondary mb-0">{translateRequestStatus(item.status)} / {translateOrderStatus(item.order?.orderStatus)}</p>
            </div>
            <span className="badge text-bg-secondary">{commandStatus}</span>
          </div>
          <dl className="row">
            <dt className="col-sm-3">Request</dt><dd className="col-sm-9">{item.id}</dd>
            <dt className="col-sm-3">Cycle</dt><dd className="col-sm-9">{item.cycleId || item.requestKind}</dd>
            <dt className="col-sm-3">Địa chỉ checkout</dt><dd className="col-sm-9">{item.order?.shippingAddress}</dd>
          </dl>
          {item.failureReason && <div className="alert alert-warning">{item.failureCode}: {item.failureReason}</div>}
          {['Pending', 'Failed'].includes(item.status) && (
            <button className="btn btn-success" type="button" disabled={processing} onClick={processExactExport}>
              {processing ? 'Đang xử lý…' : 'Xuất chính xác toàn bộ đơn'}
            </button>
          )}
          {item.status === 'Completed' && (
            <div className="alert alert-success">Completed. A replay returns the same result; packing remains a Staff action.</div>
          )}
          <div className="table-responsive mt-4">
            <table className="table">
              <thead><tr><th>Sản phẩm</th><th>SL chính xác</th><th>Tạm tính</th></tr></thead>
              <tbody>{(item.details || []).map((detail) => (
                <tr key={detail._id || detail.id}>
                  <td>{detail.productNameSnapshot}</td>
                  <td>{detail.quantity}</td>
                  <td>{formatCurrency(detail.subtotal)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
