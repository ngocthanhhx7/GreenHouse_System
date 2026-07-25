import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/pages/customer/OrderHistoryPage.jsx'), 'utf8');

describe('customer order center source contract', () => {
  it('renders approved tabs and responsive order cards', () => {
    assert.match(source, /ORDER_TABS/);
    assert.match(source, /filterOrdersByTab/);
    assert.match(source, /order-card/);
    assert.match(source, /Đơn hàng của tôi/);
  });

  it('provides distinct loading, error, and empty states', () => {
    assert.match(source, /Đang tải đơn hàng/);
    assert.match(source, /Không thể tải đơn hàng của bạn/);
    assert.match(source, /Chưa có đơn hàng/);
  });
});
