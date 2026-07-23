import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import AuthenticatedEvidenceList from '../../components/returnRefund/AuthenticatedEvidenceList.jsx';
import { returnRefundService } from '../../services/returnRefundService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

export default function ReturnRefundInspectionPage() {
  const { id } = useParams();
  const location = useLocation();
  const isProactiveCodRecovery = location.pathname.includes('/warehouse/cod-recoveries/');
  const [request, setRequest] = useState(null);
  const [items, setItems] = useState([]);
  const [warehouseNote, setWarehouseNote] = useState('');
  const [recoveryEvidenceReference, setRecoveryEvidenceReference] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loader = isProactiveCodRecovery
      ? returnRefundService.getCodRecoveryCandidate(id)
      : returnRefundService.getWarehouseRequest(id);
    loader.then((result) => {
      setRequest(result);
      setItems((result.details || [])
        .filter((detail) => Number(detail.remainingReturnQuantity ?? detail.quantity) > 0)
        .map((detail) => {
          const remainingQuantity = Number(detail.remainingReturnQuantity ?? detail.quantity);
          return { orderDetailId: detail._id || detail.id, productName: detail.productNameSnapshot, requestedQuantity: remainingQuantity, receivedQuantity: remainingQuantity, sellableQuantity: 0, damagedQuantity: remainingQuantity, warehouseNote: '' };
        }));
    }).catch((err) => setError(err.message));
  }, [id, isProactiveCodRecovery]);

  function updateItem(index, field, value) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: Number(value) } : item));
  }

  async function submitInspection(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const result = await returnRefundService.inspectRequest(id, { warehouseNote, items: items.map(({ productName, requestedQuantity, ...item }) => item) });
      setRequest(result); setMessage('Đã nhận đủ hàng, cập nhật tồn kho và chuyển hồ sơ sang đối soát hoàn tiền.');
    } catch (err) { setError(err.message); }
  }

  async function submitCodRecovery(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      await returnRefundService.recordCodRecoveryReceipt(request.orderId, {
        receiptId: `COD-RECOVERY-${request.orderId}`,
        evidenceReference: recoveryEvidenceReference,
        items: items.map(({ orderDetailId, receivedQuantity }) => ({ orderDetailId, receivedQuantity })),
      });
      setMessage('Kho đã ghi nhận thu hồi đủ hàng. Staff có thể chốt nghĩa vụ tiền theo số hệ thống xác định.');
    } catch (err) { setError(err.message); }
  }

  if (!request && !error) return <div className="page-center">Đang tải yêu cầu đổi trả...</div>;
  return <div className="surface">
    <h1>Kiểm hàng đổi trả</h1>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    {request && <>
      <p><strong>{request.orderCode}</strong> / {translateRequestStatus(request.status)}</p>
      <AuthenticatedEvidenceList urls={request.evidenceImages} />
      {['Approved', 'AwaitingInspection'].includes(request.status) ? <form onSubmit={submitInspection}>
        <div className="alert alert-info">Xác nhận theo toàn bộ dòng hàng của đơn. Số lượng nhận lại được cố định bằng số lượng đã mua; kho chỉ phân loại bán lại được hoặc hư hỏng.</div>
        <div className="table-responsive"><table className="table"><thead><tr><th>Sản phẩm</th><th>SL yêu cầu</th><th>Nhận lại</th><th>Bán lại được</th><th>Hư hỏng</th></tr></thead><tbody>
          {items.map((item, index) => <tr key={item.orderDetailId}><td>{item.productName}</td><td>{item.requestedQuantity}</td><td><strong>{item.requestedQuantity}</strong></td><td><input className="form-control" type="number" min="0" max={item.requestedQuantity} value={item.sellableQuantity} onChange={(event) => updateItem(index, 'sellableQuantity', event.target.value)} /></td><td><input className="form-control" type="number" min="0" max={item.requestedQuantity} value={item.damagedQuantity} onChange={(event) => updateItem(index, 'damagedQuantity', event.target.value)} /></td></tr>)}
        </tbody></table></div>
        <label className="form-label" htmlFor="warehouseReturnNote">Ghi chú kiểm hàng</label><textarea id="warehouseReturnNote" className="form-control" rows="3" value={warehouseNote} onChange={(event) => setWarehouseNote(event.target.value)} />
        <button className="btn btn-success mt-3" type="submit">Xác nhận kiểm hàng</button>
      </form> : request.status === 'CODRecoveryInProgress' ? <form onSubmit={submitCodRecovery}>
        <div className="alert alert-warning">Kho chỉ xác nhận khi đã nhận đủ toàn bộ số lượng của từng dòng hàng. Kho không quyết định hay nhập số tiền hoàn.</div>
        <div className="table-responsive"><table className="table"><thead><tr><th>Sản phẩm</th><th>SL phải thu hồi</th><th>SL đã nhận</th></tr></thead><tbody>
          {items.map((item, index) => <tr key={item.orderDetailId}><td>{item.productName}</td><td>{item.requestedQuantity}</td><td><input className="form-control" type="number" min="0" max={item.requestedQuantity} value={item.receivedQuantity} onChange={(event) => updateItem(index, 'receivedQuantity', event.target.value)} /></td></tr>)}
        </tbody></table></div>
        <label className="form-label" htmlFor="recoveryEvidenceReference">Mã bằng chứng nhận hàng</label>
        <input id="recoveryEvidenceReference" className="form-control" value={recoveryEvidenceReference} onChange={(event) => setRecoveryEvidenceReference(event.target.value)} required />
        <button className="btn btn-success mt-3" type="submit">Xác nhận đã thu hồi đủ hàng</button>
      </form> : <div className="alert alert-secondary">Yêu cầu này không còn ở trạng thái chờ kiểm hàng.</div>}
    </>}
  </div>;
}
