import { useEffect, useState } from 'react';

import { damageReportService } from '../../services/damageReportService.js';
import {
  createStaffQueueParams,
  normalizeStaffQueuePage,
  STAFF_QUEUE_PAGE_SIZE,
} from './staffQueuePage.js';

const pendingStatuses = new Set(['PendingReview', 'PendingWarehouseConfirmation']);
const STATUS_OPTIONS = [
  '', 'PendingReview', 'Confirmed', 'PartiallyConfirmed', 'Rejected', 'Withdrawn',
];

const STATUS_LABELS = {
  PendingReview: 'Chờ Kho kiểm tra',
  PendingWarehouseConfirmation: 'Chờ Kho kiểm tra',
  Confirming: 'Đang ghi nhận quyết định',
  Confirmed: 'Đã xác nhận hư hỏng',
  PartiallyConfirmed: 'Xác nhận hư hỏng một phần',
  Rejected: 'Kho không xác nhận hư hỏng',
  Withdrawn: 'Staff đã rút lại',
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Chưa xác định';
}

export default function DamageReportsPage() {
  const [form, setForm] = useState({ inventoryId: '', reportedQuantity: 1, reason: '', evidence: '', idempotencyKey: `damage-${Date.now()}` });
  const [report, setReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState(() => normalizeStaffQueuePage());
  const [loadingReports, setLoadingReports] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawal, setWithdrawal] = useState({ reason: '', evidence: '' });

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoadingReports(true);
      setListError('');
      try {
        const result = await damageReportService.listStaffReports(createStaffQueueParams({
          status,
          page,
          pageSize: STAFF_QUEUE_PAGE_SIZE,
        }));
        if (!cancelled) {
          const nextPage = normalizeStaffQueuePage(result, page, STAFF_QUEUE_PAGE_SIZE);
          setReports(nextPage.items);
          setPaging(nextPage);
        }
      } catch (err) {
        if (!cancelled) {
          setReports([]);
          setPaging(normalizeStaffQueuePage({}, page, STAFF_QUEUE_PAGE_SIZE));
          setListError(err.message);
        }
      } finally {
        if (!cancelled) setLoadingReports(false);
      }
    }

    loadReports();
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey, status]);

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
      setPage(1);
      setReloadKey((value) => value + 1);
      setMessage(result.replay
        ? 'Yêu cầu này đã được gửi trước đó; hệ thống hiển thị lại đúng báo cáo cũ.'
        : 'Đã gửi báo cáo và tạm cách ly số hàng này để Kho kiểm tra.');
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
      setError('Cần nhập lý do và mã dẫn chứng khi rút báo cáo.');
      return;
    }
    if (!report?.id) {
      setError('Hãy chọn một báo cáo trước khi rút lại.');
      return;
    }
    try {
      const result = await damageReportService.withdrawStaffReport(report.id, {
        reason: withdrawal.reason.trim(),
        evidence: [{ reference: withdrawal.evidence.trim() }],
      });
      setReport(result);
      setReloadKey((value) => value + 1);
      setMessage('Đã rút báo cáo đang chờ và trả số hàng cách ly về tồn có thể bán.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <h1>Báo cáo hàng hóa hư hỏng</h1>
      <p className="text-muted">Staff gửi lý do và dẫn chứng; Kho là người xác nhận số lượng hư hỏng. Tải lại trang vẫn xem và tiếp tục được các báo cáo đã tạo.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <form className="row g-3" onSubmit={submit}>
        <div className="col-md-6"><label className="form-label" htmlFor="damageInventoryId">Mã tồn kho</label><input id="damageInventoryId" className="form-control" value={form.inventoryId} onChange={(event) => updateField('inventoryId', event.target.value)} required /></div>
        <div className="col-md-3"><label className="form-label" htmlFor="damageQuantity">Số lượng hư hỏng</label><input id="damageQuantity" className="form-control" type="number" min="1" value={form.reportedQuantity} onChange={(event) => updateField('reportedQuantity', event.target.value)} required /></div>
        <div className="col-md-3"><label className="form-label" htmlFor="damageEvidence">Mã dẫn chứng</label><input id="damageEvidence" className="form-control" value={form.evidence} onChange={(event) => updateField('evidence', event.target.value)} required /></div>
        <div className="col-12"><label className="form-label" htmlFor="damageReason">Lý do hư hỏng</label><textarea id="damageReason" className="form-control" value={form.reason} onChange={(event) => updateField('reason', event.target.value)} required /></div>
        <div className="col-12"><label className="form-label" htmlFor="damageIdempotencyKey">Khóa gửi yêu cầu</label><input id="damageIdempotencyKey" className="form-control" value={form.idempotencyKey} onChange={(event) => updateField('idempotencyKey', event.target.value)} required /></div>
        <div className="col-12"><button className="btn btn-danger" type="submit" disabled={submitting}>{submitting ? 'Đang gửi…' : 'Cách ly và báo cáo'}</button></div>
      </form>

      <section className="mt-5">
        <div className="page-heading">
          <h2 className="h4">Báo cáo của tôi</h2>
          <select
            className="form-select status-select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option ? statusLabel(option) : 'Tất cả trạng thái'}
              </option>
            ))}
          </select>
        </div>
        {listError && (
          <div className="alert alert-danger d-flex align-items-center justify-content-between gap-3">
            <span>Không tải được danh sách: {listError}</span>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setReloadKey((value) => value + 1)}>
              Thử lại
            </button>
          </div>
        )}
        <div className="table-responsive" aria-busy={loadingReports}>
          <table className="table">
            <thead>
              <tr>
                <th>Mã báo cáo</th>
                <th>Mã tồn kho</th>
                <th>Số lượng</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loadingReports && (
                <tr>
                  <td colSpan="5" className="text-center text-muted">Đang tải báo cáo...</td>
                </tr>
              )}
              {!loadingReports && reports.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.inventoryId}</td>
                  <td>{item.reportedQuantity}</td>
                  <td>{statusLabel(item.status)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline-success btn-sm"
                      onClick={() => {
                        setReport(item);
                        setWithdrawal({ reason: '', evidence: '' });
                      }}
                    >
                      Xem / xử lý
                    </button>
                  </td>
                </tr>
              ))}
              {!loadingReports && !reports.length && (
                <tr>
                  <td colSpan="5" className="text-center text-muted">Chưa có báo cáo nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="d-flex align-items-center justify-content-between gap-3 mt-3">
          <span className="text-secondary">Tổng: {paging.total} báo cáo</span>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-outline-success"
              disabled={loadingReports || !paging.hasPreviousPage}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Trang trước
            </button>
            <span>Trang {paging.page}/{Math.max(1, paging.totalPages)}</span>
            <button
              type="button"
              className="btn btn-outline-success"
              disabled={loadingReports || !paging.hasNextPage}
              onClick={() => setPage((value) => value + 1)}
            >
              Trang sau
            </button>
          </div>
        </div>
      </section>

      {report && (
        <section className="mt-4" aria-live="polite">
          <h2 className="h5">Báo cáo {report.id}</h2>
          <p>
            Trạng thái: <strong>{statusLabel(report.status)}</strong>. Đã báo cáo {report.reportedQuantity} sản phẩm;
            Kho xác nhận {report.confirmedQuantity ?? 'đang chờ'}.
          </p>
          {pendingStatuses.has(report.status) && (
            <div className="row g-2">
              <div className="col-md-5">
                <input className="form-control" placeholder="Lý do rút lại" value={withdrawal.reason} onChange={(event) => setWithdrawal((current) => ({ ...current, reason: event.target.value }))} required />
              </div>
              <div className="col-md-5">
                <input className="form-control" placeholder="Mã dẫn chứng rút lại" value={withdrawal.evidence} onChange={(event) => setWithdrawal((current) => ({ ...current, evidence: event.target.value }))} required />
              </div>
              <div className="col-md-2">
                <button className="btn btn-outline-secondary" type="button" onClick={withdraw}>Rút báo cáo</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
