import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = await readFile(new URL('./OrderDetailPage.jsx', import.meta.url), 'utf8');

describe('customer order cancellation UI contract', () => {
  it('requires a reason and keeps one command key for cancellation retries', () => {
    assert.match(source, /cancelReason/);
    assert.match(source, /cancelIdempotencyKey/);
    assert.match(source, /orderService\.cancelOrder\(id,\s*\{[\s\S]*?cancelReason[\s\S]*?idempotencyKey/);
    assert.match(source, /required/);
  });

  it('offers customer cancellation only while the order is Pending, including a paid order', () => {
    assert.match(source, /order\.orderStatus === 'Pending'/);
    assert.doesNotMatch(source, /\['Pending', 'WaitingForPayment'\]/);
    assert.match(source, /\['Unpaid', 'Pending', 'Failed', 'Paid'\]/);
  });

  it('shows the persisted cancellation reason and distinguishes a replayed command', () => {
    assert.match(source, /order\.cancelReason/);
    assert.match(source, /idempotentReplay/);
    assert.match(source, /Yêu cầu hủy đơn đã được ghi nhận trước đó/);
  });
});
