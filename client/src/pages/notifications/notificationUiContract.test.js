import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const inbox = readFileSync(join(process.cwd(), 'src/pages/notifications/NotificationPage.jsx'), 'utf8');
const detail = readFileSync(join(process.cwd(), 'src/pages/notifications/NotificationDetailPage.jsx'), 'utf8');

describe('SL-009 notification UI contract', () => {
  it('AT-179 uses archive/history wording, filters, and accessible controls with loading/empty/error states', () => {
    assert.match(inbox, /status === 'active'/);
    assert.match(inbox, /status === 'unread'/);
    assert.match(inbox, /status === 'archived'/);
    assert.match(inbox, /Lưu trữ/);
    assert.match(inbox, /Lịch sử/);
    assert.doesNotMatch(inbox, /Xóa/);
    assert.match(inbox, /Đang tải/);
    assert.match(inbox, /account-empty/);
    assert.match(inbox, /alert alert-danger/);
    assert.match(inbox, /aria-label=/);
  });

  it('AT-180/AT-181 consumes only the server-resolved href and contains no client-side authority mapping', () => {
    assert.match(detail, /getNotificationTarget/);
    assert.match(detail, /target\?\.href/);
    assert.doesNotMatch(detail, /targetCollection|targetId|user\?\.role|function targetPath/);
    assert.doesNotMatch(detail, /Xóa/);
    assert.match(detail, /Lưu trữ/);
  });
});
