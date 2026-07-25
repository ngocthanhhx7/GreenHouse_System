import { useEffect, useState } from 'react';

import OperationalEvidenceUploader from '../../components/common/OperationalEvidenceUploader.jsx';
import { inventoryService } from '../../services/inventoryService.js';

function commandKey(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

export default function InventoryListPage() {
  const [inventory, setInventory] = useState([]);
  const [inputs, setInputs] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadInventory() {
    setLoading(true);
    try {
      const result = await inventoryService.listInventory();
      setInventory(result.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInventory(); }, []);

  function updateInput(id, field, value) {
    setInputs((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function recordPhysicalCount(item) {
    const values = inputs[item.id] || {};
    if (!String(values.countReason || '').trim() || !(values.countEvidence || []).length) {
      setError('Vui lòng nhập lý do và tải ít nhất 1 ảnh dẫn chứng kiểm kê.');
      return;
    }
    const key = values.countKey || commandKey(`count-${item.id}`);
    if (!values.countKey) updateInput(item.id, 'countKey', key);
    setSubmitting((current) => ({ ...current, [`count-${item.id}`]: true }));
    setError(''); setMessage('');
    try {
      const result = await inventoryService.recordPhysicalCount(item.id, {
        countedSellableQuantity: Number(values.countedSellableQuantity ?? item.sellableQuantity ?? item.stockQuantity),
        reason: values.countReason.trim(),
        evidence: values.countEvidence,
        idempotencyKey: key,
      });
      setInputs((current) => ({
        ...current,
        [item.id]: { ...current[item.id], countKey: '', countReason: '', countEvidence: [] },
      }));
      setMessage(result.replay
        ? 'Yêu cầu kiểm kê trùng đã trả về kết quả được ghi trước đó.'
        : `Đã ghi nhận kiểm kê cho ${item.productName}.`);
      await loadInventory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting((current) => ({ ...current, [`count-${item.id}`]: false }));
    }
  }

  async function setThresholdOverride(item) {
    const values = inputs[item.id] || {};
    if (!String(values.thresholdReason || '').trim() || !(values.thresholdEvidence || []).length) {
      setError('Vui lòng nhập lý do và tải ít nhất 1 ảnh dẫn chứng đổi ngưỡng.');
      return;
    }
    const key = values.thresholdKey || commandKey(`threshold-${item.id}`);
    if (!values.thresholdKey) updateInput(item.id, 'thresholdKey', key);
    setSubmitting((current) => ({ ...current, [`threshold-${item.id}`]: true }));
    setError(''); setMessage('');
    try {
      const result = await inventoryService.setThresholdOverride(item.id, {
        threshold: values.threshold ?? '',
        reason: values.thresholdReason.trim(),
        evidence: values.thresholdEvidence,
        idempotencyKey: key,
      });
      setInputs((current) => ({
        ...current,
        [item.id]: { ...current[item.id], thresholdKey: '', thresholdReason: '', thresholdEvidence: [] },
      }));
      setMessage(result.replay
        ? 'Yêu cầu đổi ngưỡng trùng đã trả về kết quả được ghi trước đó.'
        : `Đã cập nhật ngưỡng tồn kho cho ${item.productName}.`);
      await loadInventory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting((current) => ({ ...current, [`threshold-${item.id}`]: false }));
    }
  }

  return <div className="surface">
    <div className="page-heading"><h1>Quản lý tồn kho</h1></div>
    <p className="text-muted">Tồn khả dụng được tính bằng 0 khi cần đối soát. Kiểm kê chỉ thay đổi lượng có thể bán; lượng giữ chỗ, cách ly và hư hỏng vẫn được theo dõi riêng.</p>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    <div className="table-responsive"><table className="table"><thead><tr><th>Sản phẩm</th><th>Có thể bán / kiểm kê</th><th>Giữ chỗ</th><th>Cách ly</th><th>Khả dụng</th><th>Hư hỏng</th><th>Ngưỡng tồn kho</th><th>Tình trạng</th></tr></thead><tbody>
      {inventory.map((item) => {
        const values = inputs[item.id] || {};
        return <tr key={item.id}><td>{item.productName}</td><td><div>{item.sellableQuantity ?? item.stockQuantity}</div>
          <input className="form-control form-control-sm mt-1" type="number" min="0" aria-label={`Số lượng có thể bán của ${item.productName}`} value={values.countedSellableQuantity ?? (item.sellableQuantity ?? item.stockQuantity)} onChange={(event) => updateInput(item.id, 'countedSellableQuantity', event.target.value)} />
          <input className="form-control form-control-sm mt-1" placeholder="Lý do kiểm kê" value={values.countReason || ''} onChange={(event) => updateInput(item.id, 'countReason', event.target.value)} required />
          <div className="mt-2"><OperationalEvidenceUploader images={values.countEvidence || []} onChange={(images) => updateInput(item.id, 'countEvidence', images)} label="Ảnh kiểm kê" disabled={submitting[`count-${item.id}`]} /></div>
          <button className="btn btn-outline-success btn-sm mt-2" type="button" disabled={submitting[`count-${item.id}`]} onClick={() => recordPhysicalCount(item)}>{submitting[`count-${item.id}`] ? 'Đang ghi nhận…' : 'Ghi nhận kiểm kê'}</button>
        </td><td>{item.reservedQuantity}</td><td>{item.quarantinedQuantity ?? 0}</td><td>{item.availableQuantity}</td><td>{item.damagedQuantity ?? 0}</td><td>
          <div>Ngưỡng đang áp dụng: {item.effectiveThreshold ?? item.lowStockThreshold}</div>
          <input className="form-control form-control-sm mt-1" type="number" min="0" placeholder="Để trống để dùng ngưỡng chung" value={values.threshold ?? (item.lowStockThresholdOverride ?? '')} onChange={(event) => updateInput(item.id, 'threshold', event.target.value)} />
          <input className="form-control form-control-sm mt-1" placeholder="Lý do đổi ngưỡng" value={values.thresholdReason || ''} onChange={(event) => updateInput(item.id, 'thresholdReason', event.target.value)} required />
          <div className="mt-2"><OperationalEvidenceUploader images={values.thresholdEvidence || []} onChange={(images) => updateInput(item.id, 'thresholdEvidence', images)} label="Ảnh dẫn chứng đổi ngưỡng" disabled={submitting[`threshold-${item.id}`]} /></div>
          <button className="btn btn-outline-primary btn-sm mt-2" type="button" disabled={submitting[`threshold-${item.id}`]} onClick={() => setThresholdOverride(item)}>{submitting[`threshold-${item.id}`] ? 'Đang lưu…' : 'Lưu ngưỡng'}</button>
        </td><td>{item.inventoryHealth === 'ReconciliationRequired' ? 'Cần đối soát' : item.isLowStock ? 'Sắp hết hàng' : 'Bình thường'}</td></tr>;
      })}
      {!loading && !inventory.length && <tr><td colSpan="8" className="text-center text-muted">Chưa có dữ liệu tồn kho.</td></tr>}
      {loading && <tr><td colSpan="8" className="text-center text-muted">Đang tải dữ liệu tồn kho…</td></tr>}
    </tbody></table></div>
  </div>;
}
