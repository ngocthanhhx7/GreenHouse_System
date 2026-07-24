import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { supportService } from '../../services/supportService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

const SUPPORT_TYPES = ['', 'Order', 'Payment', 'ReturnRefund', 'Exchange', 'Product', 'Account', 'Other'];
const STATUS_OPTIONS = ['', 'New', 'InProgress', 'Resolved', 'Withdrawn'];
const PRIORITY_OPTIONS = ['', 'Low', 'Normal', 'High', 'Urgent'];
const ASSIGNEE_OPTIONS = ['', 'unassigned'];

export default function SupportQueuePage() {
  const [filters, setFilters] = useState({
    type: '',
    dateFrom: '',
    dateTo: '',
    status: 'New',
    priority: '',
    assigneeId: '',
    page: 1,
    pageSize: 20,
  });
  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const pendingRef = useRef('');

  async function loadQueue(nextFilters = filters) {
    setError('');
    setFieldErrors({});
    try {
      const result = await supportService.listOperational({
        type: nextFilters.type,
        dateFrom: nextFilters.dateFrom,
        dateTo: nextFilters.dateTo,
        status: nextFilters.status,
        priority: nextFilters.priority,
        assigneeId: nextFilters.assigneeId,
        page: nextFilters.page,
        pageSize: nextFilters.pageSize,
      });
      setTickets(result.items || result.requests || []);
      setPagination({
        page: result.page || nextFilters.page,
        pageSize: result.pageSize || nextFilters.pageSize,
        total: result.total || 0,
        totalPages: result.totalPages || 0,
      });
    } catch (err) {
      setError(err.message || 'Không thể tải hàng đợi hỗ trợ.');
      setFieldErrors((err.errors || []).reduce((current, item) => ({
        ...current,
        [item.field]: item.message,
      }), {}));
    }
  }

  useEffect(() => {
    loadQueue();
  }, []);

  function changeFilter(field, value) {
    const nextFilters = { ...filters, [field]: value, page: field === 'page' ? value : 1 };
    setFilters(nextFilters);
    loadQueue(nextFilters);
  }

  async function claimTicket(ticket) {
    if (pendingRef.current === `claim:${ticket.id}`) return;
    pendingRef.current = `claim:${ticket.id}`;
    setPendingAction(`claim:${ticket.id}`);
    setError('');
    try {
      await supportService.claim(
        ticket.id,
        { expectedVersion: ticket.version },
        { idempotencyKey: createCommandKey('support-claim') },
      );
      await loadQueue();
    } catch (err) {
      setError(err.message || 'Không thể nhận yêu cầu hỗ trợ.');
    } finally {
      pendingRef.current = '';
      setPendingAction('');
    }
  }

  function isClaimable(ticket) {
    return !ticket.assigneeId && (
      ticket.status === 'New'
      || (ticket.status === 'InProgress' && (ticket.assigneeCleared || ticket.unassignedInProgress || ticket.recovery))
    );
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CSKH</span>
          <h1>Hàng đợi hỗ trợ</h1>
        </div>
        <span className="text-secondary">{pagination.total} yêu cầu</span>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {errorCodeMessage(error) && <div className="field-error" role="alert">SUPPORT_FILTER_INVALID: Bộ lọc không hợp lệ.</div>}
      {fieldErrors.type && <div className="field-error" role="alert">{fieldErrors.type}</div>}
      {fieldErrors.dateFrom && <div className="field-error" role="alert">{fieldErrors.dateFrom}</div>}
      {fieldErrors.dateTo && <div className="field-error" role="alert">{fieldErrors.dateTo}</div>}
      {fieldErrors.status && <div className="field-error" role="alert">{fieldErrors.status}</div>}
      {fieldErrors.priority && <div className="field-error" role="alert">{fieldErrors.priority}</div>}
      {fieldErrors.assigneeId && <div className="field-error" role="alert">{fieldErrors.assigneeId}</div>}
      {Object.entries(fieldErrors).map(([field, message]) => (
        <div className="field-error" role="alert" key={field}>{field}: {message}</div>
      ))}
      <div className="row g-2 mb-3">
        <div className="col-md-2">
          <label className="form-label" htmlFor="supportTypeFilter">Loại</label>
          <select id="supportTypeFilter" className="form-select" value={filters.type} onChange={(event) => changeFilter('type', event.target.value)}>
            {SUPPORT_TYPES.map((type) => <option key={type || 'all'} value={type}>{type || 'Tất cả loại'}</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label" htmlFor="supportStatusFilter">Trạng thái</label>
          <select id="supportStatusFilter" className="form-select" value={filters.status} onChange={(event) => changeFilter('status', event.target.value)}>
            {STATUS_OPTIONS.map((status) => <option key={status || 'all'} value={status}>{status ? translateRequestStatus(status) : 'Tất cả trạng thái'}</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label" htmlFor="supportPriorityFilter">Ưu tiên</label>
          <select id="supportPriorityFilter" className="form-select" value={filters.priority} onChange={(event) => changeFilter('priority', event.target.value)}>
            {PRIORITY_OPTIONS.map((priority) => <option key={priority || 'all'} value={priority}>{priority || 'Tất cả ưu tiên'}</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label" htmlFor="supportAssigneeFilter">Phân công</label>
          <select id="supportAssigneeFilter" className="form-select" value={filters.assigneeId} onChange={(event) => changeFilter('assigneeId', event.target.value)}>
            {ASSIGNEE_OPTIONS.map((assigneeId) => <option key={assigneeId || 'all'} value={assigneeId}>{assigneeId === 'unassigned' ? 'Chưa phân công' : 'Tất cả người xử lý'}</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label" htmlFor="supportDateFrom">Từ ngày</label>
          <input id="supportDateFrom" type="date" className="form-control" value={filters.dateFrom} onChange={(event) => changeFilter('dateFrom', event.target.value)} />
        </div>
        <div className="col-md-2">
          <label className="form-label" htmlFor="supportDateTo">Đến ngày</label>
          <input id="supportDateTo" type="date" className="form-control" value={filters.dateTo} onChange={(event) => changeFilter('dateTo', event.target.value)} />
        </div>
      </div>
      <div className="table-responsive">
        <table className="table">
          <thead><tr><th>Mã vé</th><th>Loại</th><th>Chủ đề</th><th>Trạng thái</th><th>Ưu tiên</th><th>Phụ trách</th><th /></tr></thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>{ticket.ticketCode}</td>
                <td>{ticket.type}</td>
                <td>{ticket.subject}</td>
                <td>{translateRequestStatus(ticket.status)}</td>
                <td>{ticket.priority || 'Normal'}</td>
                <td>{ticket.assigneeDisplayName || (ticket.assigneeId ? 'Nhân viên hỗ trợ' : (isClaimable(ticket) ? 'Cần nhận lại' : 'Chưa phân công'))}</td>
                <td className="d-flex gap-2">
                  {isClaimable(ticket) && (
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      data-sl008-action="claim"
                      disabled={pendingAction === `claim:${ticket.id}`}
                      onClick={() => claimTicket(ticket)}
                    >
                      {ticket.status === 'InProgress' ? 'Cần nhận lại' : 'Nhận xử lý'}
                    </button>
                  )}
                  <Link className="btn btn-outline-success btn-sm" to={`/staff/support-requests/${ticket.id}`}>Mở</Link>
                </td>
              </tr>
            ))}
            {!tickets.length && <tr><td colSpan="7" className="text-center text-muted">Không có yêu cầu phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
      {pagination.totalPages > 1 && (
        <nav className="d-flex justify-content-between align-items-center" aria-label="Phân trang hỗ trợ">
          <button type="button" className="btn btn-outline-success" disabled={pagination.page <= 1} onClick={() => changeFilter('page', pagination.page - 1)}>Trang trước</button>
          <span>Trang {pagination.page}/{pagination.totalPages}</span>
          <button type="button" className="btn btn-outline-success" disabled={pagination.page >= pagination.totalPages} onClick={() => changeFilter('page', pagination.page + 1)}>Trang sau</button>
        </nav>
      )}
    </div>
  );
}

function errorCodeMessage(error) {
  return /SUPPORT_FILTER_INVALID|invalid.*filter/i.test(error || '');
}

function createCommandKey(operation) {
  if (globalThis.crypto?.randomUUID) return `${operation}-${globalThis.crypto.randomUUID()}`;
  return `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
