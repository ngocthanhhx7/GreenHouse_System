import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { notificationService } from '../../services/notificationService.js';
import { translateNotificationType } from '../../utils/notification.js';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notification, setNotification] = useState(null);
  const [target, setTarget] = useState(null);
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let item = await notificationService.getNotification(id);
        if (item.state === 'Unread') item = await notificationService.markAsRead(id);
        if (!active) return;
        setNotification(item);
        try {
          const authorizedTarget = await notificationService.getNotificationTarget(id);
          if (active) setTarget(authorizedTarget);
        } catch (_targetError) {
          if (active) setTargetUnavailable(true);
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [id]);

  async function archiveNotification() {
    setError('');
    try {
      await notificationService.archiveNotification(id);
      navigate('/notifications', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (loading) return <div className="account-panel account-state" role="status">Đang tải nội dung thông báo...</div>;
  if (error && !notification) return <div className="account-panel"><div className="alert alert-danger" role="alert">{error}</div><Link to="/notifications">Quay lại thông báo</Link></div>;

  return (
    <article className="account-panel notification-detail">
      <Link className="account-back-link" to="/notifications">← Quay lại thông báo</Link>
      <span className="eyebrow">{translateNotificationType(notification.type)}</span>
      <h1>{notification.subject}</h1>
      <time>{formatDate(notification.createdAt)}</time>
      <div className="notification-detail-content">{notification.content}</div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {targetUnavailable && <p className="text-muted">Nội dung liên quan hiện không còn khả dụng hoặc bạn không còn quyền truy cập.</p>}
      <div className="notification-detail-actions">
        {target?.href && <Link className="btn btn-success" to={target.href}>Xem nội dung liên quan</Link>}
        {notification.state === 'Read' && <button className="btn btn-outline-success" type="button" onClick={archiveNotification}>Lưu trữ thông báo</button>}
      </div>
    </article>
  );
}
