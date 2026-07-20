import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { notificationService } from '../../services/notificationService.js';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationPage() {
  const [status, setStatus] = useState('all');
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

  async function deleteReadNotification(id) {
    try {
      await notificationService.deleteNotification(id);
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
        <button className="btn btn-outline-success" type="button" onClick={() => loadNotifications()}>Làm mới</button>
      </header>

      <div className="notification-filters" role="tablist" aria-label="Lọc thông báo">
        <button className={status === 'all' ? 'active' : ''} type="button" role="tab" aria-selected={status === 'all'} onClick={() => setStatus('all')}>Tất cả</button>
        <button className={status === 'unread' ? 'active' : ''} type="button" role="tab" aria-selected={status === 'unread'} onClick={() => setStatus('unread')}>Chưa đọc <span>{unreadCount}</span></button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="account-state">Đang tải thông báo...</div>}
      {!loading && !items.length && <div className="account-empty">{status === 'unread' ? 'Không còn thông báo chưa đọc.' : 'Bạn chưa có thông báo nào.'}</div>}

      {!loading && items.length > 0 && (
        <div className="notification-list">
          {items.map((notification) => (
            <article className={`notification-list-item ${notification.isRead ? '' : 'unread'}`} key={notification.id}>
              <span className="notification-list-dot" aria-hidden="true" />
              <Link to={`/notifications/${notification.id}`}>
                <span className="notification-item-meta"><strong>{notification.subject}</strong><time>{formatDate(notification.createdAt)}</time></span>
                <p>{notification.content}</p>
                <small>{notification.isRead ? 'Đã đọc' : 'Chưa đọc'}</small>
              </Link>
              {notification.isRead && (
                <button className="notification-delete-button" type="button" onClick={() => deleteReadNotification(notification.id)} aria-label={`Xóa thông báo ${notification.subject}`}>Xóa</button>
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
