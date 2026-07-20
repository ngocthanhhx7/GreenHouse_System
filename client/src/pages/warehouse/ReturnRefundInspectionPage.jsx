import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { returnRefundService } from '../../services/returnRefundService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

export default function ReturnRefundInspectionPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [items, setItems] = useState([]);
  const [warehouseNote, setWarehouseNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    returnRefundService.getWarehouseRequest(id).then((result) => {
      setRequest(result);
      setItems((result.details || []).map((detail) => ({ orderDetailId: detail._id || detail.id, productName: detail.productNameSnapshot, requestedQuantity: detail.quantity, receivedQuantity: detail.quantity, sellableQuantity: 0, damagedQuantity: detail.quantity, warehouseNote: '' })));
    }).catch((err) => setError(err.message));
  }, [id]);

  function updateItem(index, field, value) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: Number(value) } : item));
  }

  async function submitInspection(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const result = await returnRefundService.inspectRequest(id, { warehouseNote, items: items.map(({ productName, requestedQuantity, ...item }) => item) });
      setRequest(result); setMessage('Đã lưu kiểm hàng và chuyển yêu cầu sang chờ hoàn tiền.');
    } catch (err) { setError(err.message); }
  }

  if (!request && !error) return <div className="page-center">Đang tải yêu cầu đổi trả...</div>;
  return <div className="surface">
    <h1>Kiểm hàng đổi trả</h1>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    {request && <>
      <p><strong>{request.orderCode}</strong> / {translateRequestStatus(request.status)}</p>
      {request.status === 'AwaitingInspection' ? <form onSubmit={submitInspection}>
        <div className="table-responsive"><table className="table"><thead><tr><th>Sản phẩm</th><th>SL yêu cầu</th><th>Nhận lại</th><th>Bán lại được</th><th>Hư hỏng</th></tr></thead><tbody>
          {items.map((item, index) => <tr key={item.orderDetailId}><td>{item.productName}</td><td>{item.requestedQuantity}</td><td><input className="form-control" type="number" min="0" max={item.requestedQuantity} value={item.receivedQuantity} onChange={(event) => updateItem(index, 'receivedQuantity', event.target.value)} /></td><td><input className="form-control" type="number" min="0" value={item.sellableQuantity} onChange={(event) => updateItem(index, 'sellableQuantity', event.target.value)} /></td><td><input className="form-control" type="number" min="0" value={item.damagedQuantity} onChange={(event) => updateItem(index, 'damagedQuantity', event.target.value)} /></td></tr>)}
        </tbody></table></div>
        <label className="form-label" htmlFor="warehouseReturnNote">Ghi chú kiểm hàng</label><textarea id="warehouseReturnNote" className="form-control" rows="3" value={warehouseNote} onChange={(event) => setWarehouseNote(event.target.value)} />
        <button className="btn btn-success mt-3" type="submit">Xác nhận kiểm hàng</button>
      </form> : <div className="alert alert-secondary">Yêu cầu này không còn ở trạng thái chờ kiểm hàng.</div>}
    </>}
  </div>;
}
