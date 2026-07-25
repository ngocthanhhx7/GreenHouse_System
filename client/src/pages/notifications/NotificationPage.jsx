import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { notificationService } from '../../services/notificationService.js';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const EMPTY_COPY = {
  active: 'Bạn chưa có thông báo đang hoạt động.',
  unread: 'Không còn thông báo chưa đọc.',
  archived: 'Lịch sử lưu trữ đang trống.',
};

export default function NotificationPage() {
  const [status, setStatus] = useState('active');
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  async function loadNotifications({ append = false, cursor = '' } = {}) {
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const result = await notificationService.listMyNotifications({ status, limit: 20, cursor });
      setItems((current) => append ? [...current, ...(result.items || [])] : (result.items || []));
      setUnreadCount(result.unreadCount || 0);
      setNextCursor(result.nextCursor || null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, [status]);

  async function archiveReadNotification(id) {
    setError('');
    try {
      await notificationService.archiveNotification(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section className="account-panel notification-inbox">
      <header className="account-page-heading notification-page-heading">
        <div>
          <span className="eyebrow">Trung tâm thông báo</span>
          <h1>Thông báo</h1>
          <p>{unreadCount > 0 ? `Bạn có ${unreadCount} thông báo chưa đọc.` : 'Bạn đã xem hết các thông báo mới.'}</p>
        </div>
        <button className="btn btn-outline-success" type="button" onClick={() => loadNotifications()} aria-label="Làm mới danh sách thông báo">Làm mới</button>
      </header>

      <div className="notification-filters" role="tablist" aria-label="Lọc thông báo">
        <button className={status === 'active' ? 'active' : ''} type="button" role="tab" aria-selected={status === 'active'} onClick={() => setStatus('active')}>Đang hoạt động</button>
        <button className={status === 'unread' ? 'active' : ''} type="button" role="tab" aria-selected={status === 'unread'} onClick={() => setStatus('unread')}>Chưa đọc <span>{unreadCount}</span></button>
        <button className={status === 'archived' ? 'active' : ''} type="button" role="tab" aria-selected={status === 'archived'} onClick={() => setStatus('archived')}>Lịch sử</button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loading && <div className="account-state" role="status">Đang tải thông báo...</div>}
      {!loading && !items.length && <div className="account-empty">{EMPTY_COPY[status]}</div>}

      {!loading && items.length > 0 && (
        <div className="notification-list">
          {items.map((notification) => (
            <article className={`notification-list-item ${notification.state === 'Unread' ? 'unread' : ''}`} key={notification.id}>
              <span className="notification-list-dot" aria-hidden="true" />
              <Link to={`/notifications/${notification.id}`}>
                <span className="notification-item-meta"><strong>{notification.subject}</strong><time>{formatDate(notification.createdAt)}</time></span>
                <p>{notification.content}</p>
                <small>{notification.state === 'Unread' ? 'Chưa đọc' : notification.state === 'Archived' ? 'Đã lưu trữ' : 'Đã đọc'}</small>
              </Link>
              {status !== 'archived' && notification.state === 'Read' && (
                <button className="notification-archive-button" type="button" onClick={() => archiveReadNotification(notification.id)} aria-label={`Lưu trữ thông báo ${notification.subject}`}>Lưu trữ</button>
              )}
            </article>
          ))}
        </div>
      )}

      {nextCursor && (
        <button className="btn btn-outline-success notification-load-more" type="button" disabled={loadingMore} onClick={() => loadNotifications({ append: true, cursor: nextCursor })}>
          {loadingMore ? 'Đang tải...' : 'Xem thêm'}
        </button>
      )}
    </section>
  );
}
