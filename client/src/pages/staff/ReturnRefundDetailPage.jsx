import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { returnRefundService } from '../../services/returnRefundService.js';
import { formatCurrency, translateRequestStatus } from '../../utils/formatters.js';

export default function ReturnRefundDetailPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ refundAmount: '', staffNote: '', completionNote: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadRequest() {
    setError('');
    try {
      const result = await returnRefundService.getStaffRequest(id);
      setRequest(result);
      setForm({ refundAmount: result.refundAmount || result.order?.totalAmount || '', staffNote: result.staffNote || '', completionNote: '' });
    } catch (err) { setError(err.message); }
  }

  useEffect(() => { loadRequest(); }, [id]);

  async function runAction(action, successMessage) {
    setError(''); setMessage('');
    try { setRequest(await action()); setMessage(successMessage); } catch (err) { setError(err.message); }
  }

  if (!request && !error) return <div className="page-center">Đang tải yêu cầu...</div>;

  return (
    <div className="surface">
      <h1>Chi tiết đổi trả / hoàn tiền</h1>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {request && <>
        <dl className="row">
          <dt className="col-sm-3">Đơn hàng</dt><dd className="col-sm-9">{request.orderCode}</dd>
          <dt className="col-sm-3">Trạng thái</dt><dd className="col-sm-9">{translateRequestStatus(request.status)}</dd>
          <dt className="col-sm-3">Lý do</dt><dd className="col-sm-9">{request.reason}</dd>
          <dt className="col-sm-3">Tổng đơn</dt><dd className="col-sm-9">{formatCurrency(request.order?.totalAmount, request.order?.currency)}</dd>
        </dl>
        <h2>Sản phẩm</h2>
        <ul className="order-item-list">{(request.details || []).map((item) => <li key={item._id || item.productId}><span>{item.productNameSnapshot} x {item.quantity}</span><strong>{formatCurrency(item.subtotal, request.order?.currency)}</strong></li>)}</ul>
        {request.status === 'Pending' && <div className="row g-3 mt-1">
          <div className="col-md-4"><label className="form-label" htmlFor="refundAmount">Số tiền hoàn</label><input id="refundAmount" className="form-control" type="number" min="0" value={form.refundAmount} onChange={(event) => setForm((current) => ({ ...current, refundAmount: event.target.value }))} /></div>
          <div className="col-md-8"><label className="form-label" htmlFor="staffNote">Ghi chú quyết định</label><input id="staffNote" className="form-control" value={form.staffNote} onChange={(event) => setForm((current) => ({ ...current, staffNote: event.target.value }))} required /></div>
          <div className="col-12 d-flex gap-2">
            <button className="btn btn-success" type="button" onClick={() => runAction(() => returnRefundService.decideRequest(id, { status: 'Approved', refundAmount: Number(form.refundAmount), staffNote: form.staffNote }), 'Đã chuyển yêu cầu sang kho kiểm hàng.')}>Duyệt để kiểm hàng</button>
            <button className="btn btn-outline-danger" type="button" onClick={() => runAction(() => returnRefundService.decideRequest(id, { status: 'Rejected', refundAmount: 0, staffNote: form.staffNote }), 'Đã từ chối yêu cầu đổi trả / hoàn tiền.')}>Từ chối</button>
          </div>
        </div>}
        {request.status === 'AwaitingInspection' && <div className="alert alert-warning mt-3">Yêu cầu đã được duyệt, đang chờ kho kiểm hàng. Staff chưa thể hoàn tiền ở bước này.</div>}
        {request.status === 'ReadyForRefund' && <div className="row g-2 mt-3 align-items-end">
          <div className="col-md-8"><label className="form-label" htmlFor="completionNote">Ghi chú hoàn tiền</label><input id="completionNote" className="form-control" value={form.completionNote} onChange={(event) => setForm((current) => ({ ...current, completionNote: event.target.value }))} /></div>
          <div className="col-md-4"><button className="btn btn-success" type="button" onClick={() => runAction(() => returnRefundService.completeRefund(id, { note: form.completionNote }), 'Đã hoàn tất đối soát hoàn tiền.')}>Hoàn tất hoàn tiền</button></div>
        </div>}
      </>}
    </div>
  );
}
