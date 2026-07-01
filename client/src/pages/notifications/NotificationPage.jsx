import { useEffect, useState } from 'react';

import { notificationService } from '../../services/notificationService.js';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function NotificationPage() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadNotifications() {
    setError('');
    try {
      const result = await notificationService.listMyNotifications();
      setItems(result.items || []);
      setUnreadCount(result.unreadCount || 0);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  async function markAsRead(id) {
    setMessage('');
    setError('');
    try {
      await notificationService.markAsRead(id);
      setMessage('Notification marked as read.');
      loadNotifications();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="surface">
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>
          <p className="text-muted mb-0">{unreadCount} unread notification(s)</p>
        </div>
        <button className="btn btn-outline-success" type="button" onClick={loadNotifications}>Refresh</button>
      </div>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Type</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.subject}</strong>
                  <div className="text-muted small">{item.content}</div>
                </td>
                <td>{item.type}</td>
                <td>{item.channel}</td>
                <td>
                  <span className={`badge ${item.isRead ? 'text-bg-secondary' : 'text-bg-success'}`}>
                    {item.isRead ? 'Read' : 'Unread'}
                  </span>
                </td>
                <td>{formatDate(item.createdAt)}</td>
                <td>
                  {!item.isRead ? (
                    <button className="btn btn-sm btn-success" type="button" onClick={() => markAsRead(item.id)}>
                      Mark read
                    </button>
                  ) : '-'}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="6" className="text-center text-muted">No notifications yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
