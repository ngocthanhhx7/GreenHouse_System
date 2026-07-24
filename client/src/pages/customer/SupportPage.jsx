import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { supportService } from '../../services/supportService.js';
import { translateRequestStatus } from '../../utils/formatters.js';

const SUPPORT_TYPES = ['Order', 'Payment', 'ReturnRefund', 'Exchange', 'Product', 'Account', 'Other'];
const ORDER_REQUIRED_TYPES = ['Order', 'Payment', 'ReturnRefund', 'Exchange'];
const OPTIONAL_REFERENCE_TYPES = ['Account', 'Other'];
const DEFAULT_PAGE = Object.freeze({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

function createCommandKey(operation) {
  if (globalThis.crypto?.randomUUID) return `${operation}-${globalThis.crypto.randomUUID()}`;
  return `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function asItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function safeFieldErrors(error) {
  const entries = error?.errors || error?.data?.errors || [];
  return Object.fromEntries(
    entries
      .filter((entry) => entry?.field && entry?.message)
      .map((entry) => [entry.field, entry.message]),
  );
}

function displayOrder(order) {
  return order?.orderCode || order?.code || 'Đơn hàng đủ điều kiện';
}

function displayProduct(product) {
  return product?.name || product?.productName || product?.title || 'Sản phẩm đang hoạt động';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN');
}

function isOpenForCustomerMessage(ticket) {
  return ticket?.status === 'New' || ticket?.status === 'InProgress';
}

function canWithdraw(ticket) {
  return ticket?.status === 'New' && !ticket?.assigneeId;
}

export default function SupportPage() {
  const { ticketId } = useParams();
  const [requests, setRequests] = useState([]);
  const [ticketPage, setTicketPage] = useState(DEFAULT_PAGE);
  const [ticketPageNumber, setTicketPageNumber] = useState(1);
  const [ticketPageSize, setTicketPageSize] = useState(20);
  const [detailTicket, setDetailTicket] = useState(null);
  const [messagePage, setMessagePage] = useState(1);
  const messagePageSize = 20;
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [activeProducts, setActiveProducts] = useState([]);
  const [form, setForm] = useState({
    type: 'Order',
    subject: '',
    initialMessage: '',
    orderId: '',
    productId: '',
  });
  const [messageDrafts, setMessageDrafts] = useState({});
  const [reopenDrafts, setReopenDrafts] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pendingActions, setPendingActions] = useState({});
  const pendingActionsRef = useRef(new Set());

  const requiresOrder = ORDER_REQUIRED_TYPES.includes(form.type);
  const requiresProduct = form.type === 'Product';
  const allowsOrder = requiresOrder || OPTIONAL_REFERENCE_TYPES.includes(form.type);
  const allowsProduct = requiresProduct || OPTIONAL_REFERENCE_TYPES.includes(form.type);

  function isPending(action) {
    return Boolean(pendingActions[action]);
  }

  function beginAction(action) {
    if (pendingActionsRef.current.has(action)) return false;
    pendingActionsRef.current.add(action);
    setPendingActions((current) => ({ ...current, [action]: true }));
    return true;
  }

  function finishAction(action) {
    pendingActionsRef.current.delete(action);
    setPendingActions((current) => ({ ...current, [action]: false }));
  }

  function showCommandError(commandError) {
    setFieldErrors(safeFieldErrors(commandError));
    setError(commandError?.message || 'Không thể hoàn tất yêu cầu hỗ trợ. Vui lòng thử lại.');
  }

  async function loadRequests() {
    try {
      const result = await supportService.listOwn({ page: ticketPageNumber, pageSize: ticketPageSize });
      setRequests(result?.items || []);
      setTicketPage({ ...DEFAULT_PAGE, ...(result || {}) });
    } catch (loadError) {
      setError(loadError?.message || 'Không thể tải các yêu cầu hỗ trợ của bạn.');
    }
  }

  async function loadReferenceOptions() {
    try {
      const [orders, products] = await Promise.all([
        supportService.listEligibleOrders(),
        supportService.listActiveProducts(),
      ]);
      setEligibleOrders(asItems(orders));
      setActiveProducts(asItems(products));
    } catch (loadError) {
      setError(loadError?.message || 'Không thể tải các lựa chọn tham chiếu được phép.');
    }
  }

  async function loadTicketDetail(nextTicketId = ticketId, nextMessagePage = messagePage) {
    if (!nextTicketId) return;
    try {
      const result = await supportService.getDetail(
        nextTicketId,
        { page: nextMessagePage, pageSize: messagePageSize },
        { scope: 'customer' },
      );
      setDetailTicket(result || null);
    } catch (loadError) {
      setError(loadError?.message || 'Không thể tải chi tiết yêu cầu hỗ trợ.');
    }
  }

  useEffect(() => {
    loadRequests();
  }, [ticketPageNumber, ticketPageSize]);

  useEffect(() => {
    loadReferenceOptions();
  }, []);

  useEffect(() => {
    if (!ticketId) {
      setDetailTicket(null);
      return;
    }
    loadTicketDetail(ticketId, messagePage);
  }, [ticketId, messagePage]);

  async function submitRequest(event) {
    event.preventDefault();
    const action = 'createRequest';
    if (!beginAction(action)) return;
    setNotice('');
    setError('');
    setFieldErrors({});
    try {
      await supportService.createRequest({
        type: form.type,
        subject: form.subject.trim(),
        initialMessage: form.initialMessage.trim(),
        orderId: form.orderId || undefined,
        productId: form.productId || undefined,
        expectedVersion: 0,
      }, {
        idempotencyKey: createCommandKey('support-create'),
      });
      setForm({ type: 'Order', subject: '', initialMessage: '', orderId: '', productId: '' });
      setNotice('Yêu cầu hỗ trợ đã được gửi.');
      await loadRequests();
    } catch (commandError) {
      showCommandError(commandError);
    } finally {
      finishAction(action);
    }
  }

  async function submitMessage(event, ticket) {
    event.preventDefault();
    const action = `appendMessage-${ticket.id}`;
    if (!beginAction(action)) return;
    setNotice('');
    setError('');
    setFieldErrors({});
    try {
      await supportService.appendMessage(ticket.id, {
        message: (messageDrafts[ticket.id] || '').trim(),
        expectedVersion: ticket.version,
      }, {
        idempotencyKey: createCommandKey('support-message'),
        scope: 'customer',
      });
      setMessageDrafts((current) => ({ ...current, [ticket.id]: '' }));
      setNotice('Tin nhắn đã được gửi.');
      if (ticketId) await loadTicketDetail(ticket.id, messagePage);
      await loadRequests();
    } catch (commandError) {
      showCommandError(commandError);
    } finally {
      finishAction(action);
    }
  }

  async function withdrawTicket(ticket) {
    const action = `withdraw-${ticket.id}`;
    if (!beginAction(action)) return;
    setNotice('');
    setError('');
    setFieldErrors({});
    try {
      await supportService.withdraw(ticket.id, {
        expectedVersion: ticket.version,
      }, {
        idempotencyKey: createCommandKey('support-withdraw'),
      });
      setNotice('Yêu cầu hỗ trợ đã được rút.');
      if (ticketId) await loadTicketDetail(ticket.id, messagePage);
      await loadRequests();
    } catch (commandError) {
      showCommandError(commandError);
    } finally {
      finishAction(action);
    }
  }

  async function submitReopen(event, ticket) {
    event.preventDefault();
    const action = `reopen-${ticket.id}`;
    if (!beginAction(action)) return;
    setNotice('');
    setError('');
    setFieldErrors({});
    try {
      await supportService.reopen(ticket.id, {
        message: (reopenDrafts[ticket.id] || '').trim(),
        expectedVersion: ticket.version,
      }, {
        idempotencyKey: createCommandKey('support-reopen'),
      });
      setReopenDrafts((current) => ({ ...current, [ticket.id]: '' }));
      setNotice('Yêu cầu hỗ trợ đã được mở lại.');
      if (ticketId) await loadTicketDetail(ticket.id, messagePage);
      await loadRequests();
    } catch (commandError) {
      showCommandError(commandError);
    } finally {
      finishAction(action);
    }
  }

  const totalTicketPages = Math.max(1, Number(ticketPage.totalPages || 0));
  const tickets = detailTicket ? [detailTicket] : requests;

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Hỗ trợ khách hàng</span>
          <h1>Yêu cầu hỗ trợ của bạn</h1>
        </div>
        <span className="text-secondary">{Number(ticketPage.total || requests.length)} yêu cầu</span>
      </div>

      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <section className="surface mb-4" aria-labelledby="new-support-request">
        <h2 id="new-support-request">Gửi yêu cầu mới</h2>
        <p className="text-secondary small">
          Privacy: do not include sensitive personal information. Vui lòng không đưa thông tin cá nhân hoặc thông tin nhạy cảm vào nội dung hỗ trợ.
        </p>
        <form className="row g-3" data-sl008-action="createRequest" disabled={isPending('createRequest')} onSubmit={submitRequest}>
          <div className="col-md-4">
            <label className="form-label" htmlFor="type">Loại yêu cầu</label>
            <select
              id="type"
              name="type"
              className={`form-select ${fieldErrors.type ? 'is-invalid' : ''}`}
              value={form.type}
              onChange={(event) => setForm((current) => ({
                ...current,
                type: event.target.value,
                orderId: '',
                productId: '',
              }))}
              required
            >
              {SUPPORT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            {fieldErrors.type && <div className="invalid-feedback">{fieldErrors.type}</div>}
          </div>

          <div className="col-md-8">
            <label className="form-label" htmlFor="subject">Chủ đề</label>
            <input
              id="subject"
              name="subject"
              className={`form-control ${fieldErrors.subject ? 'is-invalid' : ''}`}
              value={form.subject}
              maxLength={120}
              minLength={5}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              required
            />
            <div className="form-text">{form.subject.length} / 120</div>
            {fieldErrors.subject && <div className="invalid-feedback d-block">{fieldErrors.subject}</div>}
          </div>

          {(requiresOrder || allowsOrder) && (
            <div className="col-md-6">
              <label className="form-label" htmlFor="orderId">Đơn hàng</label>
              <select
                id="orderId"
                name="orderId"
                required={requiresOrder}
                className={`form-select ${fieldErrors.orderId ? 'is-invalid' : ''}`}
                value={form.orderId}
                onChange={(event) => setForm((current) => ({ ...current, orderId: event.target.value }))}
              >
                <option value="">{requiresOrder ? 'Chọn đơn hàng' : 'Không chọn đơn hàng'}</option>
                {eligibleOrders.map((order) => (
                  <option key={order.id || order._id} value={order.id || order._id}>{displayOrder(order)}</option>
                ))}
              </select>
              {fieldErrors.orderId && <div className="invalid-feedback d-block">{fieldErrors.orderId}</div>}
            </div>
          )}

          {(requiresProduct || allowsProduct) && (
            <div className="col-md-6">
              <label className="form-label" htmlFor="productId">Sản phẩm</label>
              <select
                id="productId"
                name="productId"
                required={requiresProduct}
                className={`form-select ${fieldErrors.productId ? 'is-invalid' : ''}`}
                value={form.productId}
                onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
              >
                <option value="">{requiresProduct ? 'Chọn sản phẩm' : 'Không chọn sản phẩm'}</option>
                {activeProducts.map((product) => (
                  <option key={product.id || product._id} value={product.id || product._id}>{displayProduct(product)}</option>
                ))}
              </select>
              {fieldErrors.productId && <div className="invalid-feedback d-block">{fieldErrors.productId}</div>}
            </div>
          )}

          <div className="col-12">
            <label className="form-label" htmlFor="initialMessage">Nội dung</label>
            <textarea
              id="initialMessage"
              name="initialMessage"
              className={`form-control ${fieldErrors.initialMessage ? 'is-invalid' : ''}`}
              rows="4"
              value={form.initialMessage}
              maxLength={2000}
              minLength={10}
              onChange={(event) => setForm((current) => ({ ...current, initialMessage: event.target.value }))}
              required
            />
            <div className="form-text">{form.initialMessage.length} / 2000</div>
            {fieldErrors.initialMessage && <div className="invalid-feedback d-block">{fieldErrors.initialMessage}</div>}
          </div>
          <div className="col-12">
            <button className="btn btn-success" type="submit" disabled={isPending('createRequest')}>
              {isPending('createRequest') ? 'Đang gửi…' : 'Gửi yêu cầu'}
            </button>
          </div>
        </form>
      </section>

      <section className="surface" aria-labelledby="my-support-requests">
        <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
          <h2 id="my-support-requests" className="mb-0">Yêu cầu của tôi</h2>
          {!ticketId && <span className="text-secondary small">Trang {ticketPageNumber}/{totalTicketPages}</span>}
        </div>

        {tickets.map((ticket) => {
          const messages = ticket.messages?.items || [];
          const currentMessagePage = messagePage;
          const messageTotalPages = Math.max(1, Number(messages.totalPages || ticket.messages?.totalPages || 0));
          const onClickMessagePageChange = (nextPage) => setMessagePage(nextPage);
          const reopenDeadline = ticket.reopenDeadline;
          const deadline = reopenDeadline ? new Date(reopenDeadline) : null;
          const canReopen = ticket.status === 'Resolved'
            && Boolean(deadline)
            && !Number.isNaN(deadline.getTime())
            && deadline.getTime() >= Date.now();
          const appendAction = `appendMessage-${ticket.id}`;
          const withdrawAction = `withdraw-${ticket.id}`;
          const reopenAction = `reopen-${ticket.id}`;

          return (
            <article className="border-bottom py-4" key={ticket.id}>
              <div className="d-flex flex-wrap justify-content-between gap-2">
                <div>
                  <div className="small text-secondary">{ticket.ticketCode || 'Yêu cầu hỗ trợ'} · {ticket.type}</div>
                  <h3 className="h5 mb-1">{ticket.subject || 'Yêu cầu hỗ trợ'}</h3>
                  <span className="badge text-bg-light">{translateRequestStatus(ticket.status)}</span>
                </div>
                {!ticketId && (
                  <Link className="btn btn-sm btn-outline-secondary" to={`/support/${ticket.id}`}>
                    Xem chi tiết
                  </Link>
                )}
              </div>

              {ticket.finalMessage && <p className="mt-3 mb-0">{ticket.finalMessage}</p>}
              {ticket.resolutionMessage && <p className="mt-3 mb-0">{ticket.resolutionMessage}</p>}

              <div className="mt-3" aria-label="Dòng thời gian tin nhắn">
                <h4 className="h6">Tin nhắn</h4>
                {messages.map((message) => (
                  <div className="border rounded p-2 mb-2" key={message.id || `${message.createdAt}-${message.content}`}>
                    <div className="small text-secondary">{message.actorRole || message.role} · {formatDate(message.createdAt)}</div>
                    <p className="mb-0">{message.content}</p>
                  </div>
                ))}
                {!messages.length && <p className="text-secondary small mb-0">Chưa có tin nhắn nào.</p>}
                {ticketId && messageTotalPages > 1 && (
                  <div className="d-flex align-items-center gap-2 mt-2">
                    <span className="small">Trang {currentMessagePage}/{messageTotalPages}</span>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      type="button"
                      disabled={currentMessagePage <= 1}
                      onClick={() => onClickMessagePageChange(Math.max(1, currentMessagePage - 1))}
                    >
                      Trước
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      type="button"
                      disabled={currentMessagePage >= messageTotalPages}
                      onClick={() => onClickMessagePageChange(Math.min(messageTotalPages, currentMessagePage + 1))}
                    >
                      Sau
                    </button>
                  </div>
                )}
              </div>

              {isOpenForCustomerMessage(ticket) && (
                <form
                  className="mt-3"
                  data-sl008-action="appendMessage"
                  disabled={isPending(appendAction)}
                  onSubmit={(event) => submitMessage(event, ticket)}
                >
                  <label className="form-label" htmlFor={`message-${ticket.id}`}>Gửi thêm thông tin</label>
                  <textarea
                    id={`message-${ticket.id}`}
                    className="form-control"
                    rows="3"
                    value={messageDrafts[ticket.id] || ''}
                    maxLength={2000}
                    onChange={(event) => setMessageDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                    required
                  />
                  <div className="form-text">{(messageDrafts[ticket.id] || '').length} / 2000</div>
                  <button className="btn btn-outline-success btn-sm mt-2" type="submit" disabled={isPending(appendAction)}>
                    {isPending(appendAction) ? 'Đang gửi…' : 'Gửi tin nhắn'}
                  </button>
                </form>
              )}

              {canWithdraw(ticket) && (
                <button
                  className="btn btn-outline-danger btn-sm mt-3"
                  type="button"
                  data-sl008-action="withdraw"
                  disabled={isPending(withdrawAction)}
                  onClick={() => withdrawTicket(ticket)}
                >
                  {isPending(withdrawAction) ? 'Đang rút…' : 'Rút yêu cầu'}
                </button>
              )}

              {ticket.status === 'Resolved' && (
                <form
                  className="mt-3"
                  data-sl008-action="reopen"
                  disabled={!canReopen || isPending(reopenAction)}
                  onSubmit={(event) => submitReopen(event, ticket)}
                >
                  <label className="form-label" htmlFor={`reopen-${ticket.id}`}>Lý do mở lại</label>
                  <textarea
                    id={`reopen-${ticket.id}`}
                    className="form-control"
                    rows="3"
                    value={reopenDrafts[ticket.id] || ''}
                    maxLength={2000}
                    disabled={!canReopen || isPending(reopenAction)}
                    onChange={(event) => setReopenDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                    required
                  />
                  <div className="form-text">
                    {reopenDeadline ? `Có thể mở lại đến ${formatDate(reopenDeadline)}.` : 'Thời hạn mở lại không còn hiệu lực.'}
                  </div>
                  <button className="btn btn-outline-primary btn-sm mt-2" type="submit" disabled={!canReopen || isPending(reopenAction)}>
                    {isPending(reopenAction) ? 'Đang mở lại…' : 'Mở lại yêu cầu'}
                  </button>
                </form>
              )}
            </article>
          );
        })}

        {!tickets.length && <p className="text-secondary mb-0">Bạn chưa có yêu cầu hỗ trợ nào.</p>}

        {!ticketId && (
          <div className="d-flex align-items-center gap-2 mt-3" aria-label="Phân trang yêu cầu hỗ trợ">
            <label htmlFor="ticketPageSize">Hiển thị</label>
            <select
              id="ticketPageSize"
              value={ticketPageSize}
              onChange={(event) => {
                setTicketPageSize(Number(event.target.value));
                setTicketPageNumber(1);
              }}
            >
              {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <button
              className="btn btn-sm btn-outline-secondary"
              type="button"
              disabled={ticketPageNumber <= 1}
              onClick={() => setTicketPageNumber((page) => Math.max(1, page - 1))}
            >
              Trước
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              type="button"
              disabled={ticketPageNumber >= totalTicketPages}
              onClick={() => setTicketPageNumber((page) => Math.min(totalTicketPages, page + 1))}
            >
              Sau
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
