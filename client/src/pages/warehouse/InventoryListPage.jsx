import { useEffect, useState } from 'react';

import { inventoryService } from '../../services/inventoryService.js';

export default function InventoryListPage() {
  const [inventory, setInventory] = useState([]);
  const [countInputs, setCountInputs] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadInventory() {
    setError('');
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

  useEffect(() => {
    loadInventory();
  }, []);

  async function recordPhysicalCount(item) {
    setError('');
    setMessage('');
    const input = countInputs[item.id] || {};
    try {
      await inventoryService.recordPhysicalCount(item.id, {
        countedSellableQuantity: Number(input.countedSellableQuantity ?? item.sellableQuantity ?? item.stockQuantity),
        reason: input.reason || 'Physical cycle count',
        evidence: [{ reference: input.evidence || 'warehouse-count' }],
        idempotencyKey: `count-${item.id}-${Date.now()}`,
      });
      setMessage(`Physical count recorded for ${item.productName}.`);
      await loadInventory();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <h1>Inventory</h1>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Sellable / count</th>
              <th>Reserved</th>
              <th>Quarantined</th>
              <th>Available</th>
              <th>Damaged</th>
              <th>Threshold</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => {
              const values = countInputs[item.id] || {};
              return (
                <tr key={item.id}>
                  <td>{item.productName}</td>
                  <td>
                    <div>{item.sellableQuantity ?? item.stockQuantity}</div>
                    <input
                      className="form-control form-control-sm"
                      type="number"
                      min="0"
                      aria-label={`Sellable count for ${item.productName}`}
                      value={values.countedSellableQuantity ?? (item.sellableQuantity ?? item.stockQuantity)}
                      onChange={(event) => setCountInputs((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], countedSellableQuantity: event.target.value },
                      }))}
                    />
                    <input
                      className="form-control form-control-sm mt-1"
                      placeholder="Evidence reference"
                      aria-label={`Evidence for ${item.productName}`}
                      value={values.evidence || ''}
                      onChange={(event) => setCountInputs((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], evidence: event.target.value },
                      }))}
                    />
                    <button className="btn btn-outline-success btn-sm mt-1" type="button" onClick={() => recordPhysicalCount(item)}>
                      Record count
                    </button>
                  </td>
                  <td>{item.reservedQuantity}</td>
                  <td>{item.quarantinedQuantity ?? 0}</td>
                  <td>{item.availableQuantity}</td>
                  <td>{item.damagedQuantity}</td>
                  <td>{item.effectiveThreshold ?? item.lowStockThreshold}</td>
                  <td>{item.inventoryHealth === 'ReconciliationRequired' ? 'Reconciliation required' : item.isLowStock ? 'Low stock' : 'Normal'}</td>
                </tr>
              );
            })}
            {!loading && !inventory.length && (
              <tr><td colSpan="8" className="text-center text-muted">No inventory records.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
