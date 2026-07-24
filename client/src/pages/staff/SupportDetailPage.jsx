import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import useAuth from '../../hooks/useAuth.js';
import { supportService } from '../../services/supportService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

export default function SupportDetailPage() {
  const { ticketId, id } = useParams();
  const currentTicketId = ticketId || id;
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [activeStaff, setActiveStaff] = useState([]);
  const [messagePage, setMessagePage] = useState(1);
  const [messageDraft, setMessageDraft] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [priorityReason, setPriorityReason] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [finalMessage, setFinalMessage] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pendingRef = useRef('');

  async function loadDetail(nextPage = messagePage) {
    setError('');
    try {
      const [result, transferTargets] = await Promise.all([
        supportService.getDetail(currentTicketId, { page: nextPage, pageSize: 20 }, { scope: 'staff' }),
        supportService.listActiveStaff(currentTicketId),
      ]);
      const nextTicket = {
        ...result,
        transferTargets: Array.isArray(result.transferTargets)
          ? result.transferTargets
          : (Array.isArray(transferTargets) ? transferTargets : []),
      };
      setTicket(nextTicket);
      setActiveStaff(nextTicket.transferTargets || []);
      setPriority(nextTicket.priority || 'Normal');
      setAssigneeId(nextTicket.assigneeId || '');
    } catch (err) {
      setError(err.message || 'Không thể tải chi tiết hỗ trợ.');
    }
  }

  useEffect(() => {
    loadDetail();
  }, [currentTicketId, messagePage]);

  const isCurrentAssignee = Boolean(
    ticket
    && user?.role === 'Staff'
    && user?.status === 'Active'
    && String(ticket.assigneeId || '') === String(user.id || '')
    && ticket.status === 'InProgress'
  );

  async function runCommand(method, call, successMessage) {
    if (pendingRef.current === method) return;
    pendingRef.current = method;
    setPendingAction(method);
    setMessage('');
    setError('');
    try {
      await call();
      setMessage(successMessage);
      await loadDetail();
    } catch (err) {
      setError(err.message || 'Support command failed');
    } finally {
      pendingRef.current = '';
      setPendingAction('');
    }
  }

  async function appendMessage(event) {
    event.preventDefault();
    await runCommand('appendMessage', () => supportService.appendMessage(
      currentTicketId,
      { message: messageDraft, expectedVersion: ticket.version },
      { idempotencyKey: createCommandKey('support-message'), scope: 'staff' },
    ), 'Đã thêm phản hồi.');
    setMessageDraft('');
  }

  async function changePriority(event) {
    event.preventDefault();
    await runCommand('changePriority', () => supportService.changePriority(
      currentTicketId,
      { priority, reason: priorityReason, expectedVersion: ticket.version },
      { idempotencyKey: createCommandKey('support-priority') },
    ), 'Đã cập nhật mức ưu tiên.');
  }

  async function transfer(event) {
    event.preventDefault();
    await runCommand('transfer', () => supportService.transfer(
      currentTicketId,
      { assigneeId, reason: transferReason, expectedVersion: ticket.version },
      { idempotencyKey: createCommandKey('support-transfer') },
    ), 'Đã chuyển người phụ trách.');
  }

  async function resolve(event) {
    event.preventDefault();
    await runCommand('resolve', () => supportService.resolve(
      currentTicketId,
      { finalMessage, expectedVersion: ticket.version },
      { idempotencyKey: createCommandKey('support-resolve') },
    ), 'Đã ghi nhận giải quyết.');
    setFinalMessage('');
  }

  if (!ticket && !error) return <div className="page-center">Đang tải yêu cầu hỗ trợ...</div>;

  const messages = ticket?.messages?.items || [];
  const assignmentHistory = ticket?.assignmentHistory || [];
  const priorityHistory = ticket?.priorityHistory || [];
  const resolutionHistory = ticket?.resolutionHistory || [];

  return (
    <div className="surface">
      <div className="page-heading"><div><span className="eyebrow">CSKH</span><h1>Chi tiết hỗ trợ</h1></div><span className="badge text-bg-light">{ticket?.ticketCode}</span></div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {ticket && (
        <>
          <dl className="row">
            <dt className="col-sm-3">Mã vé</dt><dd className="col-sm-9">{ticket.ticketCode}</dd>
            <dt className="col-sm-3">Loại</dt><dd className="col-sm-9">{ticket.type}</dd>
            <dt className="col-sm-3">Chủ đề</dt><dd className="col-sm-9">{ticket.subject}</dd>
            <dt className="col-sm-3">Trạng thái</dt><dd className="col-sm-9">{translateRequestStatus(ticket.status)}</dd>
            <dt className="col-sm-3">Ưu tiên</dt><dd className="col-sm-9">{ticket.priority || 'Normal'}</dd>
            <dt className="col-sm-3">Phụ trách</dt><dd className="col-sm-9">{ticket.assigneeDisplayName || (ticket.assigneeId ? 'Nhân viên hỗ trợ' : (ticket.status === 'InProgress' ? 'Cần nhận lại' : 'Chưa phân công'))}</dd>
          </dl>
          <section aria-labelledby="support-messages-heading">
            <h2 id="support-messages-heading">Trao đổi</h2>
            <div className="vstack gap-2">
              {messages.map((message) => (
                <article className="border rounded p-2" key={message.id}>
                  <p className="mb-0">{message.content}</p>
                  <div className="small text-secondary">{message.actorRole} · {message.createdAt}</div>
                </article>
              ))}
            </div>
            {ticket.messages?.totalPages > 1 && (
              <div className="d-flex justify-content-between align-items-center mt-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={messagePage <= 1} onClick={() => setMessagePage(messagePage - 1)}>Cũ hơn</button>
                <span>Trang {ticket.messages.page}/{ticket.messages.totalPages}</span>
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={messagePage >= ticket.messages.totalPages} onClick={() => setMessagePage(messagePage + 1)}>Mới hơn</button>
              </div>
            )}
          </section>
          {isCurrentAssignee && (
            <>
              <form className="row g-2 mt-3" data-sl008-action="appendMessage" disabled={pendingAction === 'appendMessage'} onSubmit={appendMessage}>
                <div className="col-12"><label className="form-label" htmlFor="staffMessage">Phản hồi</label><textarea id="staffMessage" name="message" className="form-control" maxLength={2000} value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} /></div>
                <div className="col-12"><button type="submit" className="btn btn-success" disabled={pendingAction === 'appendMessage'}>Gửi phản hồi</button></div>
              </form>
              <form className="row g-2 mt-3" data-sl008-action="changePriority" disabled={pendingAction === 'changePriority'} onSubmit={changePriority}>
                <div className="col-md-4"><label className="form-label" htmlFor="priority">Ưu tiên</label><select id="priority" name="priority" className="form-select" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="Low">Low</option><option value="Normal">Normal</option><option value="High">High</option><option value="Urgent">Urgent</option></select></div>
                <div className="col-md-8"><label className="form-label" htmlFor="priorityReason">Lý do ưu tiên</label><input id="priorityReason" name="priorityReason" className="form-control" required minLength={5} maxLength={500} value={priorityReason} onChange={(event) => setPriorityReason(event.target.value)} /></div>
                <div className="col-12"><button type="submit" className="btn btn-outline-success" disabled={pendingAction === 'changePriority'}>Lưu ưu tiên</button></div>
              </form>
              <form className="row g-2 mt-3" data-sl008-action="transfer" disabled={pendingAction === 'transfer'} onSubmit={transfer}>
                <div className="col-md-4"><label className="form-label" htmlFor="assigneeId">Chuyển cho</label><select id="assigneeId" name="assigneeId" className="form-select" required value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>{activeStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}</select></div>
                <div className="col-md-8"><label className="form-label" htmlFor="transferReason">Lý do chuyển</label><input id="transferReason" name="transferReason" className="form-control" required minLength={5} maxLength={500} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} /></div>
                <div className="col-12"><button type="submit" className="btn btn-outline-success" disabled={pendingAction === 'transfer'}>Chuyển người phụ trách</button></div>
              </form>
              <form className="row g-2 mt-3" data-sl008-action="resolve" disabled={pendingAction === 'resolve'} onSubmit={resolve}>
                <div className="col-12"><label className="form-label" htmlFor="finalMessage">Phản hồi cuối cùng</label><textarea id="finalMessage" name="finalMessage" className="form-control" required maxLength={2000} value={finalMessage} onChange={(event) => setFinalMessage(event.target.value)} /></div>
                <div className="col-12"><button type="submit" className="btn btn-success" disabled={pendingAction === 'resolve'}>Đánh dấu đã giải quyết</button></div>
              </form>
            </>
          )}
          <section className="mt-4"><h2>Lịch sử phân công</h2>{assignmentHistory.map((entry, index) => <div key={`assignment-${index}`}>{entry.beforeAssigneeId || '—'} → {entry.afterAssigneeId || '—'} · {entry.reason} · {entry.createdAt}</div>)}</section>
          <section className="mt-3"><h2>Lịch sử ưu tiên</h2>{priorityHistory.map((entry, index) => <div key={`priority-${index}`}>{entry.beforePriority || '—'} → {entry.afterPriority || '—'} · {entry.reason} · {entry.createdAt}</div>)}</section>
          <section className="mt-3"><h2>Lịch sử giải quyết</h2>{resolutionHistory.map((entry, index) => <div key={`resolution-${index}`}>{entry.transition} · {entry.reopenDeadline || '—'} · {entry.createdAt}</div>)}</section>
        </>
      )}
    </div>
  );
}

function createCommandKey(operation) {
  if (globalThis.crypto?.randomUUID) return `${operation}-${globalThis.crypto.randomUUID()}`;
  return `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
