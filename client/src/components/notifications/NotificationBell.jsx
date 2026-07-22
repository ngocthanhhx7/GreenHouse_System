import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { notificationService } from '../../services/notificationService.js';

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const navigate = useNavigate();

  function closeDropdown() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function loadPreview() {
    setLoading(true);
    setError('');
    try {
      const result = await notificationService.listMyNotifications({ limit: 5 });
      setItems(result.items || []);
      setUnreadCount(result.unreadCount || 0);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPreview();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function handleDocumentClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function toggleDropdown() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) await loadPreview();
  }

  async function openNotification(notification) {
    try {
      if (!notification.isRead) {
        await notificationService.markAsRead(notification.id);
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      setOpen(false);
      navigate(`/notifications/${notification.id}`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        ref={triggerRef}
        className="header-icon-btn notification-bell-button"
        type="button"
        aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggleDropdown}
      >
        <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-dropdown" role="dialog" aria-label="Thông báo gần đây">
          <div className="notification-dropdown-heading">
            <strong>Thông báo</strong>
            <span>{unreadCount} chưa đọc</span>
            <button className="notification-dropdown-close" type="button" aria-label="Đóng thông báo" onClick={closeDropdown}>×</button>
          </div>
          {loading && <p className="notification-dropdown-state">Đang tải thông báo...</p>}
          {!loading && error && <p className="notification-dropdown-state text-danger">{error}</p>}
          {!loading && !error && items.length === 0 && <p className="notification-dropdown-state">Bạn chưa có thông báo.</p>}
          {!loading && !error && items.map((notification) => (
            <button
              className={`notification-preview ${notification.isRead ? '' : 'unread'}`}
              key={notification.id}
              type="button"
              onClick={() => openNotification(notification)}
            >
              <span className="notification-preview-dot" aria-hidden="true" />
              <span>
                <strong>{notification.subject}</strong>
                <small>{notification.content}</small>
                <time>{formatTime(notification.createdAt)}</time>
              </span>
            </button>
          ))}
          <Link className="notification-view-all" to="/notifications" onClick={() => setOpen(false)}>
            Xem tất cả thông báo
          </Link>
        </div>
      )}
    </div>
  );
}
