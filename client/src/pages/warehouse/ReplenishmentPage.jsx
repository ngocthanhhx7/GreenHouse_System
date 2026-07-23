import { useEffect, useState } from 'react';

import { inventoryService } from '../../services/inventoryService.js';
import { replenishmentService } from '../../services/replenishmentService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

function commandKey(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

export default function ReplenishmentPage() {
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ inventoryId: '', quantity: 20, reason: '', evidence: '', requestKey: '' });
  const [requestInputs, setRequestInputs] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [inventoryData, requestData] = await Promise.all([inventoryService.listLowStock(), replenishmentService.listWarehouseRequests()]);
      setInventory(inventoryData.items || []);
      setRequests(requestData.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  function updateRequestInput(id, field, value) {
    setRequestInputs((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function createRequest(event) {
    event.preventDefault();
    const key = form.requestKey || commandKey(`replenishment-${form.inventoryId}`);
    if (!form.requestKey) setForm((current) => ({ ...current, requestKey: key }));
    setSubmitting((current) => ({ ...current, create: true }));
    setError('');
    setMessage('');
    try {
      const result = await replenishmentService.createWarehouseRequest({
        inventoryId: form.inventoryId,
        quantity: Number(form.quantity),
        reason: form.reason,
        evidence: [{ reference: form.evidence }],
        idempotencyKey: key,
      });
      setForm((current) => ({ ...current, reason: '', evidence: '', requestKey: '' }));
      setMessage(result.replay ? 'Duplicate request submission returned the existing replenishment request.' : 'Replenishment request created.');
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting((current) => ({ ...current, create: false }));
    }
  }

  async function receiveRequest(request) {
    const values = requestInputs[request.id] || {};
    const deliveredQuantity = Number(values.deliveredQuantity);
    const acceptedSellableQuantity = Number(values.acceptedSellableQuantity);
    const rejectedQuantity = Number(values.rejectedQuantity);
    if (deliveredQuantity !== acceptedSellableQuantity + rejectedQuantity) {
      setError('Delivered quantity must equal accepted plus rejected quantity.');
      return;
    }
    if (rejectedQuantity > 0 && !String(values.rejectedReason || '').trim()) {
      setError('Rejected quantity requires a rejection reason.');
      return;
    }
    const key = values.receiptKey || commandKey(`receipt-${request.id}`);
    if (!values.receiptKey) updateRequestInput(request.id, 'receiptKey', key);
    setSubmitting((current) => ({ ...current, [`receipt-${request.id}`]: true }));
    setError('');
    setMessage('');
    try {
      const result = await replenishmentService.receiveWarehouseRequest(request.id, {
        supplierReference: values.supplierReference,
        deliveryReference: values.deliveryReference,
        deliveredQuantity,
        acceptedSellableQuantity,
        rejectedQuantity,
        rejectedReason: values.rejectedReason,
        evidence: [{ reference: values.receiptEvidence }],
        idempotencyKey: key,
      });
      updateRequestInput(request.id, 'receiptKey', '');
      setMessage(result.replay ? 'Duplicate receipt submission returned the recorded receipt.' : `Receipt recorded for ${request.productName}.`);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting((current) => ({ ...current, [`receipt-${request.id}`]: false }));
    }
  }

  async function withdrawRequest(request) {
    const values = requestInputs[request.id] || {};
    if (!String(values.withdrawReason || '').trim()) { setError('Withdrawal reason is required.'); return; }
    setError(''); setMessage('');
    try {
      await replenishmentService.withdrawWarehouseRequest(request.id, { reason: values.withdrawReason });
      setMessage('Pending replenishment request withdrawn.');
      await loadData();
    } catch (err) { setError(err.message); }
  }

  async function requestShortClosure(request) {
    const values = requestInputs[request.id] || {};
    if (!String(values.shortClosureReason || '').trim() || !String(values.shortClosureEvidence || '').trim()) { setError('Short-closure reason and evidence are required.'); return; }
    setError(''); setMessage('');
    try {
      await replenishmentService.requestShortClosure(request.id, { reason: values.shortClosureReason, evidence: [{ reference: values.shortClosureEvidence }] });
      setMessage('Short closure was submitted for Admin decision.');
      await loadData();
    } catch (err) { setError(err.message); }
  }

  async function correctReceipt(request) {
    const values = requestInputs[request.id] || {};
    const correction = Number(values.acceptedQuantityCorrection);
    if (!Number.isInteger(correction) || correction === 0 || !String(values.correctionReason || '').trim() || !String(values.correctionEvidence || '').trim()) {
      setError('Correction quantity, reason, and evidence are required.'); return;
    }
    const key = values.correctionKey || commandKey(`correction-${request.id}`);
    if (!values.correctionKey) updateRequestInput(request.id, 'correctionKey', key);
    setError(''); setMessage('');
    try {
      const result = await replenishmentService.correctReceipt(request.id, {
        correctionOf: values.correctionOf,
        acceptedQuantityCorrection: correction,
        reason: values.correctionReason,
        evidence: [{ reference: values.correctionEvidence }],
        idempotencyKey: key,
      });
      updateRequestInput(request.id, 'correctionKey', '');
      setMessage(result.replay ? 'Duplicate correction submission returned the existing correction.' : 'Receipt correction recorded as a compensating movement.');
      await loadData();
    } catch (err) { setError(err.message); }
  }

  return <div className="surface">
    <h1>Replenishment</h1>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    <form className="admin-form compact" onSubmit={createRequest}>
      <select className="form-select" value={form.inventoryId} onChange={(event) => setForm((current) => ({ ...current, inventoryId: event.target.value }))} required><option value="">Choose a low-stock product</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.productName} ({item.availableQuantity} available / threshold {item.effectiveThreshold ?? item.lowStockThreshold})</option>)}</select>
      <input className="form-control" type="number" min="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
      <input className="form-control" placeholder="Request reason" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required />
      <input className="form-control" placeholder="Evidence reference" value={form.evidence} onChange={(event) => setForm((current) => ({ ...current, evidence: event.target.value }))} required />
      <button className="btn btn-success" type="submit" disabled={submitting.create}>{submitting.create ? 'Submitting…' : 'Create request'}</button>
    </form>
    <div className="table-responsive mt-4"><table className="table"><thead><tr><th>Product</th><th>Approved / accepted</th><th>Status</th><th>Warehouse actions</th></tr></thead><tbody>
      {requests.map((request) => {
        const values = requestInputs[request.id] || {};
        const canReceive = ['Approved', 'PartiallyReceived'].includes(request.status);
        return <tr key={request.id}><td>{request.productName}</td><td>{request.approvedQuantity ?? request.quantity} / {request.netAcceptedQuantity ?? request.receivedQuantity ?? 0}</td><td>{translateRequestStatus(request.status)}</td><td className="d-grid gap-1">
          {request.status === 'PendingApproval' && <><input className="form-control form-control-sm" placeholder="Withdrawal reason" value={values.withdrawReason || ''} onChange={(event) => updateRequestInput(request.id, 'withdrawReason', event.target.value)} /><button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => withdrawRequest(request)}>Withdraw request</button></>}
          {canReceive && <><input className="form-control form-control-sm" placeholder="Supplier reference" value={values.supplierReference || ''} onChange={(event) => updateRequestInput(request.id, 'supplierReference', event.target.value)} required /><input className="form-control form-control-sm" placeholder="Delivery reference" value={values.deliveryReference || ''} onChange={(event) => updateRequestInput(request.id, 'deliveryReference', event.target.value)} required /><input className="form-control form-control-sm" type="number" min="0" placeholder="Delivered quantity" value={values.deliveredQuantity || ''} onChange={(event) => updateRequestInput(request.id, 'deliveredQuantity', event.target.value)} required /><input className="form-control form-control-sm" type="number" min="0" placeholder="Accepted sellable quantity" value={values.acceptedSellableQuantity || ''} onChange={(event) => updateRequestInput(request.id, 'acceptedSellableQuantity', event.target.value)} required /><input className="form-control form-control-sm" type="number" min="0" placeholder="Rejected quantity" value={values.rejectedQuantity || ''} onChange={(event) => updateRequestInput(request.id, 'rejectedQuantity', event.target.value)} required /><input className="form-control form-control-sm" placeholder="Rejected reason (required when rejected)" value={values.rejectedReason || ''} onChange={(event) => updateRequestInput(request.id, 'rejectedReason', event.target.value)} /><input className="form-control form-control-sm" placeholder="Receipt evidence reference" value={values.receiptEvidence || ''} onChange={(event) => updateRequestInput(request.id, 'receiptEvidence', event.target.value)} required /><button className="btn btn-outline-success btn-sm" type="button" disabled={submitting[`receipt-${request.id}`]} onClick={() => receiveRequest(request)}>{submitting[`receipt-${request.id}`] ? 'Recording…' : 'Record receipt'}</button>
            <input className="form-control form-control-sm" placeholder="Short-closure reason" value={values.shortClosureReason || ''} onChange={(event) => updateRequestInput(request.id, 'shortClosureReason', event.target.value)} /><input className="form-control form-control-sm" placeholder="Short-closure evidence" value={values.shortClosureEvidence || ''} onChange={(event) => updateRequestInput(request.id, 'shortClosureEvidence', event.target.value)} /><button className="btn btn-outline-warning btn-sm" type="button" onClick={() => requestShortClosure(request)}>Request short closure</button>
          </>}
          {['Approved', 'PartiallyReceived', 'Completed', 'ClosedShort'].includes(request.status) && <><input className="form-control form-control-sm" placeholder="Original receipt ID" value={values.correctionOf || ''} onChange={(event) => updateRequestInput(request.id, 'correctionOf', event.target.value)} /><input className="form-control form-control-sm" type="number" placeholder="Accepted correction (+/-)" value={values.acceptedQuantityCorrection || ''} onChange={(event) => updateRequestInput(request.id, 'acceptedQuantityCorrection', event.target.value)} /><input className="form-control form-control-sm" placeholder="Correction reason" value={values.correctionReason || ''} onChange={(event) => updateRequestInput(request.id, 'correctionReason', event.target.value)} /><input className="form-control form-control-sm" placeholder="Correction evidence reference" value={values.correctionEvidence || ''} onChange={(event) => updateRequestInput(request.id, 'correctionEvidence', event.target.value)} /><button className="btn btn-outline-primary btn-sm" type="button" onClick={() => correctReceipt(request)}>Correct receipt</button></>}
        </td></tr>;
      })}
      {!loading && !requests.length && <tr><td colSpan="4" className="text-center text-muted">No replenishment requests.</td></tr>}
      {loading && <tr><td colSpan="4" className="text-center text-muted">Loading replenishment requests…</td></tr>}
    </tbody></table></div>
  </div>;
}
