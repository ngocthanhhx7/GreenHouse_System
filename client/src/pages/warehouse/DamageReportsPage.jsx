import { useEffect, useState } from 'react';

import { damageReportService } from '../../services/damageReportService.js';

const reviewStatuses = new Set(['PendingReview', 'PendingWarehouseConfirmation']);

export default function DamageReportsPage() {
  const [reports, setReports] = useState([]);
  const [decisionInputs, setDecisionInputs] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadReports() {
    try {
      const result = await damageReportService.listWarehouseReports();
      setReports(result.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadReports(); }, []);

  function updateInput(id, field, value) {
    setDecisionInputs((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function decide(report) {
    const input = decisionInputs[report.id] || {};
    setError('');
    setMessage('');
    if (!String(input.decisionReason || '').trim() || !String(input.evidence || '').trim()) {
      setError('Decision reason and evidence reference are required.');
      return;
    }
    const idempotencyKey = input.idempotencyKey || `damage-decision-${report.id}-${Date.now()}`;
    if (!input.idempotencyKey) updateInput(report.id, 'idempotencyKey', idempotencyKey);
    try {
      const result = await damageReportService.decideWarehouseReport(report.id, {
        confirmedQuantity: Number(input.confirmedQuantity ?? report.reportedQuantity),
        decisionReason: input.decisionReason,
        evidence: [{ reference: input.evidence }],
        idempotencyKey,
      });
      updateInput(report.id, 'idempotencyKey', '');
      setMessage(`Damage decision recorded: ${result.status}.`);
      await loadReports();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Damage review</h1>
      <p className="text-muted">Enter the verified quantity: all reported units confirms the report, a lower positive number is partial, and zero rejects it.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <div className="table-responsive"><table className="table"><thead><tr><th>Inventory</th><th>Reported</th><th>Evidence</th><th>Status</th><th>Warehouse decision</th></tr></thead><tbody>
        {reports.map((report) => {
          const values = decisionInputs[report.id] || {};
          return <tr key={report.id}><td>{report.inventoryId}</td><td>{report.reportedQuantity}</td><td>{report.evidence?.map((entry) => entry.reference).filter(Boolean).join(', ') || '-'}</td><td>{report.status}</td><td>
            {reviewStatuses.has(report.status) ? <div className="d-grid gap-1">
              <input className="form-control form-control-sm" type="number" min="0" max={report.reportedQuantity} aria-label={`Confirmed quantity for ${report.id}`} value={values.confirmedQuantity ?? report.reportedQuantity} onChange={(event) => updateInput(report.id, 'confirmedQuantity', event.target.value)} />
              <input className="form-control form-control-sm" placeholder="Decision reason" value={values.decisionReason || ''} onChange={(event) => updateInput(report.id, 'decisionReason', event.target.value)} required />
              <input className="form-control form-control-sm" placeholder="Decision evidence reference" value={values.evidence || ''} onChange={(event) => updateInput(report.id, 'evidence', event.target.value)} required />
              <button className="btn btn-outline-success btn-sm" type="button" onClick={() => decide(report)}>Record full / partial / reject</button>
            </div> : 'Closed'}
          </td></tr>;
        })}
        {!reports.length && <tr><td colSpan="5" className="text-center text-muted">No damage reports.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
