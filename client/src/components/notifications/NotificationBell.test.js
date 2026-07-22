import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/components/notifications/NotificationBell.jsx'), 'utf8');

describe('notification bell UX contract', () => {
  it('opens a five-item dropdown instead of navigating directly', () => {
    assert.match(source, /limit: 5/);
    assert.match(source, /notification-dropdown/);
    assert.match(source, /Xem tất cả thông báo/);
    assert.doesNotMatch(source, /<Link[^>]+to="\/notifications"[^>]+className="header-icon-btn"/);
  });

  it('marks an unread item before navigating to its detail page', () => {
    assert.match(source, /markAsRead/);
    assert.match(source, /navigate\(`\/notifications\/\$\{notification\.id\}`\)/);
  });

  it('remains reusable in both storefront and internal topbars', () => {
    const internalTopbar = readFileSync(join(process.cwd(), 'src/components/layout/InternalTopbar.jsx'), 'utf8');
    const header = readFileSync(join(process.cwd(), 'src/components/layout/Header.jsx'), 'utf8');

    assert.match(internalTopbar, /<NotificationBell/);
    assert.match(header, /<NotificationBell/);
  });

  it('returns focus to its trigger when Escape or the close control dismisses the disclosure', () => {
    assert.match(source, /triggerRef/);
    assert.match(source, /event\.key === 'Escape'[\s\S]*?triggerRef\.current\?\.focus\(\)/);
    assert.match(source, /aria-label="Đóng thông báo"/);
    assert.match(source, /onClick=\{closeDropdown\}/);
  });
});
