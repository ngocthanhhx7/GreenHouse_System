import { useEffect, useState } from 'react';

import { inventoryService } from '../../services/inventoryService.js';

function newCommandKey(shipmentId) {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `returned-receipt:${shipmentId}:${random}`;
}

function initialDraft(item) {
  return {
    receivedAt: new Date().toISOString().slice(0, 16),
    evidenceReference: '',
    lines: item.lines.map((line) => ({
      orderDetailId: line.orderDetailId,
      receivedQuantity: line.expectedQuantity,
      sellableQuantity: line.expectedQuantity,
      damagedQuantity: 0,
    })),
  };
}

export default function ReturnedParcelQueuePage() {
  const [items, setItems] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [commandKeys, setCommandKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [submittingShipment, setSubmittingShipment] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    inventoryService.listReturnedParcels()
      .then((result) => {
        const nextItems = result.items || [];
        setItems(nextItems);
        setDrafts(Object.fromEntries(nextItems.map((item) => [item.shipmentId, initialDraft(item)])));
        setCommandKeys(Object.fromEntries(
          nextItems.map((item) => [item.shipmentId, newCommandKey(item.shipmentId)]),
        ));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  function updateDraft(shipmentId, patch) {
    setDrafts((current) => ({
      ...current,
      [shipmentId]: { ...current[shipmentId], ...patch },
    }));
  }

  function updateLine(shipmentId, lineIndex, field, value) {
    setDrafts((current) => {
      const lines = current[shipmentId].lines.map((line, index) => (
        index === lineIndex ? { ...line, [field]: Number(value) } : line
      ));
      return { ...current, [shipmentId]: { ...current[shipmentId], lines } };
    });
  }

  async function submitReceipt(event, item) {
    event.preventDefault();
    const draft = drafts[item.shipmentId];
    const invalidLine = draft.lines.some((line, index) => (
      line.receivedQuantity !== item.lines[index].expectedQuantity
      || line.sellableQuantity + line.damagedQuantity !== line.receivedQuantity
    ));
    if (invalidLine) {
      setError('Mỗi dòng phải nhận đủ số lượng và được phân loại hết thành bán được hoặc hư hỏng.');
      return;
    }

    setSubmittingShipment(item.shipmentId);
    setError('');
    setFieldErrors({});
    setMessage('');
    try {
      const result = await inventoryService.recordReturnedParcelReceipt(item.shipmentId, {
        ...draft,
        receivedAt: new Date(draft.receivedAt).toISOString(),
        idempotencyKey: commandKeys[item.shipmentId],
      });
      setItems((current) => current.filter((entry) => entry.shipmentId !== item.shipmentId));
      setMessage(result.idempotentReplay
        ? 'Biên nhận này đã được xử lý trước đó; không có biến động tồn kho lặp lại.'
        : `Đã ghi nhận và phân loại kiện hoàn của đơn ${item.orderCode}.`);
    } catch (requestError) {
      setError(requestError.message);
      setFieldErrors(Object.fromEntries(
        (requestError.errors || []).map((entry) => [entry.field, entry.message]),
      ));
    } finally {
      setSubmittingShipment('');
    }
  }

  return (
    <div className="surface">
      <h1>Kiện giao thất bại trả về kho</h1>
      <p className="text-muted">
        Chỉ ghi nhận hiện vật thực nhận. Phân loại đủ từng dòng vào tồn bán được hoặc hàng hư hỏng.
      </p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {loading && <p>Đang tải kiện hoàn…</p>}

      {!loading && items.map((item) => {
        const draft = drafts[item.shipmentId];
        if (!draft) return null;
        const pending = submittingShipment === item.shipmentId;
        return (
          <form
            className="card mb-4"
            key={item.shipmentId}
            onSubmit={(event) => submitReceipt(event, item)}
          >
            <div className="card-body">
              <h2 className="h5">Đơn {item.orderCode}</h2>
              <p className="mb-1">Carrier: {item.carrierName} · Mã theo dõi: {item.trackingReference}</p>
              <p className="text-muted">
                Carrier trả về: {item.returnedAt ? new Date(item.returnedAt).toLocaleString('vi-VN') : 'Chưa rõ'}
                {' · '}
                Bằng chứng: {item.returnEvidenceAvailable ? 'Đã có' : 'Thiếu'}
              </p>

              <div className="table-responsive">
                <table className="table align-middle">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Phải nhận</th>
                      <th>Thực nhận</th>
                      <th>Bán được</th>
                      <th>Hư hỏng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.lines.map((line, lineIndex) => (
                      <tr key={line.orderDetailId}>
                        <td>{line.productName || line.productSku || line.productId}</td>
                        <td>{line.expectedQuantity}</td>
                        {['receivedQuantity', 'sellableQuantity', 'damagedQuantity'].map((field) => (
                          <td key={field}>
                            <input
                              aria-label={`${field}-${line.orderDetailId}`}
                              className="form-control"
                              type="number"
                              min="0"
                              max={line.expectedQuantity}
                              step="1"
                              value={draft.lines[lineIndex][field]}
                              onChange={(event) => updateLine(
                                item.shipmentId,
                                lineIndex,
                                field,
                                event.target.value,
                              )}
                              disabled={pending}
                              required
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor={`receivedAt-${item.shipmentId}`}>
                    Thời điểm kho thực nhận
                  </label>
                  <input
                    id={`receivedAt-${item.shipmentId}`}
                    className="form-control"
                    type="datetime-local"
                    value={draft.receivedAt}
                    onChange={(event) => updateDraft(item.shipmentId, { receivedAt: event.target.value })}
                    disabled={pending}
                    required
                  />
                  {fieldErrors.receivedAt && <div className="text-danger">{fieldErrors.receivedAt}</div>}
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor={`evidenceReference-${item.shipmentId}`}>
                    Tham chiếu bằng chứng nhận kiện
                  </label>
                  <input
                    id={`evidenceReference-${item.shipmentId}`}
                    className="form-control"
                    value={draft.evidenceReference}
                    onChange={(event) => updateDraft(
                      item.shipmentId,
                      { evidenceReference: event.target.value },
                    )}
                    disabled={pending}
                    required
                  />
                  {fieldErrors.evidenceReference
                    && <div className="text-danger">{fieldErrors.evidenceReference}</div>}
                </div>
              </div>

              <button className="btn btn-success mt-3" type="submit" disabled={pending}>
                {pending ? 'Đang ghi nhận…' : 'Ghi nhận chính xác một lần'}
              </button>
            </div>
          </form>
        );
      })}

      {!loading && !items.length && <p className="text-muted">Không có kiện hoàn đang chờ kho nhận.</p>}
    </div>
  );
}
