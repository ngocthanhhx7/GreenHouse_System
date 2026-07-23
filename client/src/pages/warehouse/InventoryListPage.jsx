import { useEffect, useState } from 'react';

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
    if (!String(values.countReason || '').trim() || !String(values.countEvidence || '').trim()) {
      setError('Count reason and evidence reference are required.');
      return;
    }
    const key = values.countKey || commandKey(`count-${item.id}`);
    if (!values.countKey) updateInput(item.id, 'countKey', key);
    setSubmitting((current) => ({ ...current, [`count-${item.id}`]: true }));
    setError('');
    setMessage('');
    try {
      const result = await inventoryService.recordPhysicalCount(item.id, {
        countedSellableQuantity: Number(values.countedSellableQuantity ?? item.sellableQuantity ?? item.stockQuantity),
        reason: values.countReason.trim(),
        evidence: [{ reference: values.countEvidence.trim() }],
        idempotencyKey: key,
      });
      updateInput(item.id, 'countKey', '');
      setMessage(result.replay ? 'Duplicate physical-count submission returned the existing count.' : `Physical count recorded for ${item.productName}.`);
      await loadInventory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting((current) => ({ ...current, [`count-${item.id}`]: false }));
    }
  }

  async function setThresholdOverride(item) {
    const values = inputs[item.id] || {};
    if (!String(values.thresholdReason || '').trim() || !String(values.thresholdEvidence || '').trim()) {
      setError('Threshold reason and evidence reference are required.');
      return;
    }
    setSubmitting((current) => ({ ...current, [`threshold-${item.id}`]: true }));
    setError('');
    setMessage('');
    try {
      await inventoryService.setThresholdOverride(item.id, {
        threshold: values.threshold ?? '',
        reason: values.thresholdReason.trim(),
        evidence: [{ reference: values.thresholdEvidence.trim() }],
      });
      setMessage(`Threshold updated for ${item.productName}.`);
      await loadInventory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting((current) => ({ ...current, [`threshold-${item.id}`]: false }));
    }
  }

  return <div className="surface">
    <div className="page-heading"><h1>Inventory</h1></div>
    <p className="text-muted">Available stock is zero while reconciliation is required. Counts only change the physical sellable dimension; reserved, quarantined, and damaged quantities remain visible.</p>
    {error && <div className="alert alert-danger">{error}</div>}
    {message && <div className="alert alert-success">{message}</div>}
    <div className="table-responsive"><table className="table"><thead><tr><th>Product</th><th>Sellable / physical count</th><th>Reserved</th><th>Quarantined</th><th>Available</th><th>Damaged</th><th>Threshold override</th><th>Health</th></tr></thead><tbody>
      {inventory.map((item) => {
        const values = inputs[item.id] || {};
        return <tr key={item.id}><td>{item.productName}</td><td><div>{item.sellableQuantity ?? item.stockQuantity}</div>
          <input className="form-control form-control-sm mt-1" type="number" min="0" aria-label={`Sellable count for ${item.productName}`} value={values.countedSellableQuantity ?? (item.sellableQuantity ?? item.stockQuantity)} onChange={(event) => updateInput(item.id, 'countedSellableQuantity', event.target.value)} />
          <input className="form-control form-control-sm mt-1" placeholder="Count reason" value={values.countReason || ''} onChange={(event) => updateInput(item.id, 'countReason', event.target.value)} required />
          <input className="form-control form-control-sm mt-1" placeholder="Evidence reference" aria-label={`Evidence for ${item.productName}`} value={values.countEvidence || ''} onChange={(event) => updateInput(item.id, 'countEvidence', event.target.value)} required />
          <button className="btn btn-outline-success btn-sm mt-1" type="button" disabled={submitting[`count-${item.id}`]} onClick={() => recordPhysicalCount(item)}>{submitting[`count-${item.id}`] ? 'Recording…' : 'Record count'}</button>
        </td><td>{item.reservedQuantity}</td><td>{item.quarantinedQuantity ?? 0}</td><td>{item.availableQuantity}</td><td>{item.damagedQuantity ?? 0}</td><td>
          <div>Effective: {item.effectiveThreshold ?? item.lowStockThreshold}</div>
          <input className="form-control form-control-sm mt-1" type="number" min="0" placeholder="Override (blank clears)" value={values.threshold ?? (item.lowStockThresholdOverride ?? '')} onChange={(event) => updateInput(item.id, 'threshold', event.target.value)} />
          <input className="form-control form-control-sm mt-1" placeholder="Threshold reason" value={values.thresholdReason || ''} onChange={(event) => updateInput(item.id, 'thresholdReason', event.target.value)} required />
          <input className="form-control form-control-sm mt-1" placeholder="Evidence reference" value={values.thresholdEvidence || ''} onChange={(event) => updateInput(item.id, 'thresholdEvidence', event.target.value)} required />
          <button className="btn btn-outline-primary btn-sm mt-1" type="button" disabled={submitting[`threshold-${item.id}`]} onClick={() => setThresholdOverride(item)}>{submitting[`threshold-${item.id}`] ? 'Saving…' : 'Save threshold'}</button>
        </td><td>{item.inventoryHealth === 'ReconciliationRequired' ? 'Reconciliation required' : item.isLowStock ? 'Low stock' : 'Normal'}</td></tr>;
      })}
      {!loading && !inventory.length && <tr><td colSpan="8" className="text-center text-muted">No inventory records.</td></tr>}
    </tbody></table></div>
  </div>;
}
