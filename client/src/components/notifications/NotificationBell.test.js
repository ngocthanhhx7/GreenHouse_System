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
});
