import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import AuthenticatedEvidenceList from '../../components/returnRefund/AuthenticatedEvidenceList.jsx';
import { exchangeService } from '../../services/exchangeService.js';
import { translateExchangeStatus } from '../../utils/afterSalesLabels.js';
import {
  getExchangeWorkflowActions,
  getExchangeWorkflowMessage,
} from '../../utils/exchangeUiState.js';

function commandKey(prefix) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() || Date.now()}`;
}

export default function ExchangeInspectionPage() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [receiptReference, setReceiptReference] = useState('');
  const [inspectionLines, setInspectionLines] = useState([]);
  const [shipmentLineId, setShipmentLineId] = useState('');
  const [direction, setDirection] = useState('REPLACEMENT_TO_CUSTOMER');
  const [carrierName, setCarrierName] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const receiptKey = useRef(commandKey('exchange-receipt'));
  const inspectionKey = useRef(commandKey('exchange-inspection'));
  const shipmentKey = useRef(commandKey('exchange-shipment'));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function hydrate(result) {
    setRequest(result);
    setInspectionLines((result.lines || []).map((line) => ({
      exchangeLineId: line._id,
      productName: line.productNameSnapshot,
      requestedQuantity: Number(line.requestedQuantity),
      receivedQuantity: Number(line.requestedQuantity),
      acceptedSellableQuantity: Number(line.acceptedSellableQuantity || 0),
      acceptedDamagedQuantity: Number(line.acceptedDamagedQuantity || 0),
      rejectedQuantity: Number(line.rejectedQuantity || 0),
      inspectionReason: line.inspectionReason || '',
      rejectionReason: line.rejectionReason || '',
      evidenceImages: line.rejectionEvidenceImages || [],
      evidenceFiles: [],
    })));
  }

  function load() {
    exchangeService.getWarehouseRequest(id).then(hydrate).catch((err) => setError(err.message));
  }
  useEffect(load, [id]);

  function updateLine(index, field, value) {
    setInspectionLines((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? {
          ...item,
          [field]: ['inspectionReason', 'rejectionReason', 'evidenceFiles'].includes(field)
            ? value
            : Number(value),
        }
        : item
    )));
  }

  async function recordReceipt(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const result = await exchangeService.recordWarehouseReceipt(id, {
        idempotencyKey: receiptKey.current,
        receivedAt: new Date().toISOString(),
        evidenceReference: receiptReference,
      });
      hydrate(result);
      setMessage('Đã ghi nhận Kho nhận kiện hàng.');
    } catch (err) { setError(err.message); }
  }

  async function finalizeInspection(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const uploadedLines = await Promise.all(inspectionLines.map(async (line) => {
        let evidenceImages = line.evidenceImages || [];
        if ((line.evidenceFiles || []).length) {
          const uploaded = await exchangeService.uploadEvidence(line.evidenceFiles);
          evidenceImages = (uploaded.items || []).map((item) => item.url);
        }
        if (!evidenceImages.length) throw new Error(`Vui lòng tải bằng chứng kiểm hàng cho ${line.productName}.`);
        const { productName, requestedQuantity, evidenceFiles, ...payload } = line;
        return { ...payload, evidenceImages };
      }));
      const result = await exchangeService.finalizeInspection(id, {
        idempotencyKey: inspectionKey.current,
        lines: uploadedLines,
      });
      hydrate(result);
      setMessage('Đã kiểm đủ từng đơn vị và mở đúng nghĩa vụ giao ra.');
    } catch (err) { setError(err.message); }
  }

  async function createShipment(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const line = (request.lines || []).find((item) => item._id === shipmentLineId);
      const quantity = direction === 'REPLACEMENT_TO_CUSTOMER'
        ? Number(line.acceptedSellableQuantity || 0) + Number(line.acceptedDamagedQuantity || 0)
        : Number(line.rejectedQuantity || 0);
      const result = await exchangeService.createOutboundShipment(id, {
        idempotencyKey: shipmentKey.current,
        exchangeLineId: shipmentLineId,
        direction,
        quantity,
        carrierName,
        trackingCode,
        shippedAt: new Date().toISOString(),
      });
      hydrate(result.request);
      shipmentKey.current = commandKey('exchange-shipment');
      setMessage('Đã tạo chuyến hàng ra đúng loại nghĩa vụ.');
    } catch (err) { setError(err.message); }
  }

  if (!request && !error) return <div className="page-center">Đang tải công việc đổi hàng...</div>;
  const workflowActions = getExchangeWorkflowActions(request);
  const workflowMessage = getExchangeWorkflowMessage(request);
  return (
    <div className="surface">
      <div className="page-heading"><h1>Kiểm hàng đổi hàng</h1><Link className="btn btn-outline-success" to="/warehouse/exchanges">Hàng đợi</Link></div>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {request && (
        <>
          <p><strong>{request.requestCode}</strong> / {translateExchangeStatus(request.status)}</p>
          <AuthenticatedEvidenceList urls={request.evidenceImages} fetchEvidence={exchangeService.fetchEvidence} />
          {workflowMessage && <div className="alert alert-warning mt-3">{workflowMessage}</div>}

          {request.status === 'CustomerShipped' && (
            <form className="mt-3" onSubmit={recordReceipt}>
              <label className="form-label" htmlFor="exchangeReceipt">Mã bằng chứng Kho nhận kiện</label>
              <input id="exchangeReceipt" className="form-control" value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} required />
              <button className="btn btn-success mt-2" type="submit">Ghi nhận đã nhận kiện</button>
            </form>
          )}

          {request.status === 'WarehouseInspecting' && (
            <form className="mt-4" onSubmit={finalizeInspection}>
              <div className="alert alert-info">Mỗi dòng phải đủ: nhận = chấp nhận bán lại được + chấp nhận hư hỏng + từ chối.</div>
              <div className="table-responsive">
                <table className="table">
                  <thead><tr><th>Sản phẩm</th><th>Yêu cầu</th><th>Nhận</th><th>Bán lại được</th><th>Hư hỏng</th><th>Từ chối</th><th>Kết luận/lý do</th><th>Bằng chứng</th></tr></thead>
                  <tbody>
                    {inspectionLines.map((line, index) => (
                      <tr key={line.exchangeLineId}>
                        <td>{line.productName}</td>
                        <td>{line.requestedQuantity}</td>
                        <td><strong>{line.receivedQuantity}</strong></td>
                        <td><input aria-label="acceptedSellableQuantity" className="form-control" type="number" min="0" max={line.requestedQuantity} value={line.acceptedSellableQuantity} onChange={(event) => updateLine(index, 'acceptedSellableQuantity', event.target.value)} /></td>
                        <td><input aria-label="acceptedDamagedQuantity" className="form-control" type="number" min="0" max={line.requestedQuantity} value={line.acceptedDamagedQuantity} onChange={(event) => updateLine(index, 'acceptedDamagedQuantity', event.target.value)} /></td>
                        <td><input aria-label="rejectedQuantity" className="form-control" type="number" min="0" max={line.requestedQuantity} value={line.rejectedQuantity} onChange={(event) => updateLine(index, 'rejectedQuantity', event.target.value)} /></td>
                        <td>
                          <input
                            aria-label="inspectionReason"
                            className="form-control"
                            value={line.inspectionReason}
                            onChange={(event) => {
                              updateLine(index, 'inspectionReason', event.target.value);
                              if (line.rejectedQuantity > 0) updateLine(index, 'rejectionReason', event.target.value);
                            }}
                            required
                          />
                        </td>
                        <td>
                          <input
                            aria-label="inspectionEvidence"
                            className="form-control"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={(event) => updateLine(index, 'evidenceFiles', Array.from(event.target.files || []).slice(0, 5))}
                            required={!line.evidenceImages.length}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-success" type="submit">Chốt kết quả kiểm hàng</button>
            </form>
          )}

          {workflowActions.canCreateOutbound && (
            <form className="mt-4" onSubmit={createShipment}>
              <h2>Tạo chuyến hàng ra</h2>
              <label className="form-label" htmlFor="exchangeShipmentLine">Dòng hàng</label>
              <select id="exchangeShipmentLine" className="form-select" value={shipmentLineId} onChange={(event) => setShipmentLineId(event.target.value)} required>
                <option value="">Chọn dòng hàng</option>
                {(request.lines || []).map((line) => <option key={line._id} value={line._id}>{line.productNameSnapshot}</option>)}
              </select>
              <label className="form-label mt-2" htmlFor="exchangeShipmentDirection">Loại chuyến</label>
              <select id="exchangeShipmentDirection" className="form-select" value={direction} onChange={(event) => setDirection(event.target.value)}>
                <option value="REPLACEMENT_TO_CUSTOMER">Giao sản phẩm thay thế đúng SKU</option>
                <option value="REJECTED_ORIGINAL_TO_CUSTOMER">Trả lại hàng bị từ chối</option>
              </select>
              <label className="form-label mt-2" htmlFor="exchangeCarrier">Đơn vị vận chuyển</label>
              <input id="exchangeCarrier" className="form-control" value={carrierName} onChange={(event) => setCarrierName(event.target.value)} required />
              <label className="form-label mt-2" htmlFor="exchangeTracking">Mã vận đơn</label>
              <input id="exchangeTracking" className="form-control" value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} required />
              <button className="btn btn-success mt-2" type="submit">Tạo chuyến hàng</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
