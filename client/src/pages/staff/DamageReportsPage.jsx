import { useState } from 'react';

import { damageReportService } from '../../services/damageReportService.js';

const pendingStatuses = new Set(['PendingReview', 'PendingWarehouseConfirmation']);

export default function DamageReportsPage() {
  const [form, setForm] = useState({ inventoryId: '', reportedQuantity: 1, reason: '', evidence: '', idempotencyKey: `damage-${Date.now()}` });
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawal, setWithdrawal] = useState({ reason: '', evidence: '' });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSubmitting(true);
    try {
      const result = await damageReportService.createStaffReport({
        inventoryId: form.inventoryId,
        reportedQuantity: Number(form.reportedQuantity),
        reason: form.reason,
        evidence: [{ reference: form.evidence }],
        idempotencyKey: form.idempotencyKey,
      });
      setReport(result);
      setForm((current) => ({ ...current, idempotencyKey: `damage-${Date.now()}` }));
      setMessage(result.replay ? 'Duplicate submission detected; the existing damage report was returned.' : 'Damage report submitted and the units are quarantined for review.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function withdraw() {
    setMessage('');
    setError('');
    if (!withdrawal.reason.trim() || !withdrawal.evidence.trim()) {
      setError('Withdrawal reason and evidence reference are required.');
      return;
    }
    try {
      const result = await damageReportService.withdrawStaffReport(report.id, {
        reason: withdrawal.reason.trim(),
        evidence: [{ reference: withdrawal.evidence.trim() }],
      });
      setReport(result);
      setMessage('Pending damage report withdrawn; quarantined units were released.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Report damaged inventory</h1>
      <p className="text-muted">Submit evidence before the Warehouse decision. Re-submitting the same idempotency key shows duplicate feedback instead of moving stock twice.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <form className="row g-3" onSubmit={submit}>
        <div className="col-md-6"><label className="form-label" htmlFor="damageInventoryId">Inventory ID</label><input id="damageInventoryId" className="form-control" value={form.inventoryId} onChange={(event) => updateField('inventoryId', event.target.value)} required /></div>
        <div className="col-md-3"><label className="form-label" htmlFor="damageQuantity">Damaged quantity</label><input id="damageQuantity" className="form-control" type="number" min="1" value={form.reportedQuantity} onChange={(event) => updateField('reportedQuantity', event.target.value)} required /></div>
        <div className="col-md-3"><label className="form-label" htmlFor="damageEvidence">Evidence reference</label><input id="damageEvidence" className="form-control" value={form.evidence} onChange={(event) => updateField('evidence', event.target.value)} required /></div>
        <div className="col-12"><label className="form-label" htmlFor="damageReason">Damage reason</label><textarea id="damageReason" className="form-control" value={form.reason} onChange={(event) => updateField('reason', event.target.value)} required /></div>
        <div className="col-12"><label className="form-label" htmlFor="damageIdempotencyKey">Submission key</label><input id="damageIdempotencyKey" className="form-control" value={form.idempotencyKey} onChange={(event) => updateField('idempotencyKey', event.target.value)} required /></div>
        <div className="col-12"><button className="btn btn-danger" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Quarantine and report'}</button></div>
      </form>
      {report && <section className="mt-4" aria-live="polite">
        <h2 className="h5">Report {report.id}</h2>
        <p>Status: <strong>{report.status}</strong>. Reported {report.reportedQuantity} unit(s); confirmed {report.confirmedQuantity ?? 'pending'}.</p>
        {pendingStatuses.has(report.status) && <div className="row g-2"><div className="col-md-5"><input className="form-control" placeholder="Withdrawal reason" value={withdrawal.reason} onChange={(event) => setWithdrawal((current) => ({ ...current, reason: event.target.value }))} required /></div><div className="col-md-5"><input className="form-control" placeholder="Withdrawal evidence reference" value={withdrawal.evidence} onChange={(event) => setWithdrawal((current) => ({ ...current, evidence: event.target.value }))} required /></div><div className="col-md-2"><button className="btn btn-outline-secondary" type="button" onClick={withdraw}>Withdraw pending report</button></div></div>}
      </section>}
    </div>
  );
}
