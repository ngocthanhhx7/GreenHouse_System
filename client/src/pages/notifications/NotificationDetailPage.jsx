import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { notificationService } from '../../services/notificationService.js';
import useAuth from '../../hooks/useAuth.js';
import { translateNotificationType } from '../../utils/notification.js';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let item = await notificationService.getNotification(id);
        if (!item.isRead) item = await notificationService.markAsRead(id);
        if (active) setNotification(item);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [id]);

  async function removeNotification() {
    try {
      await notificationService.deleteNotification(id);
      navigate('/notifications', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function targetPath() {
    if (!notification?.targetId) return '';
    if (notification.targetCollection === 'Order') {
      if (user?.role === 'Customer') return `/orders/${notification.targetId}`;
      if (user?.role === 'Staff') return `/staff/orders/${notification.targetId}`;
    }
    if (notification.targetCollection === 'ReturnRefundRequest') {
      if (user?.role === 'Staff') return `/staff/return-refunds/${notification.targetId}`;
      if (user?.role === 'WarehouseManager') return `/warehouse/return-refunds/${notification.targetId}`;
      return '/return-refunds';
    }
    if (notification.targetCollection === 'ExchangeCase') {
      if (user?.role === 'Staff') return `/staff/exchanges/${notification.targetId}`;
      if (user?.role === 'WarehouseManager') return `/warehouse/exchanges/${notification.targetId}`;
      return `/exchanges/${notification.targetId}`;
    }
    return '';
  }

  if (loading) return <div className="account-panel account-state">Đang tải nội dung thông báo...</div>;
  if (error && !notification) return <div className="account-panel"><div className="alert alert-danger">{error}</div><Link to="/notifications">Quay lại thông báo</Link></div>;

  return (
    <article className="account-panel notification-detail">
      <Link className="account-back-link" to="/notifications">← Quay lại thông báo</Link>
      <span className="eyebrow">{translateNotificationType(notification.type)}</span>
      <h1>{notification.subject}</h1>
      <time>{formatDate(notification.createdAt)}</time>
      <div className="notification-detail-content">{notification.content}</div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="notification-detail-actions">
        {targetPath() && <Link className="btn btn-success" to={targetPath()}>Xem nội dung liên quan</Link>}
        {notification.isRead && <button className="btn btn-outline-danger" type="button" onClick={removeNotification}>Xóa thông báo</button>}
      </div>
    </article>
  );
}
