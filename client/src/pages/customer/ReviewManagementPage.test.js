import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/pages/customer/ReviewManagementPage.jsx'), 'utf8');

describe('customer review center source contract', () => {
  it('owns pending and completed purchase review tabs', () => {
    assert.match(source, /Chờ đánh giá/);
    assert.match(source, /Đã đánh giá/);
    assert.match(source, /listMyOrders/);
    assert.match(source, /getOrder/);
    assert.match(source, /buildReviewWorkspace/);
  });

  it('binds create, update, and publication commands with concurrency facts', () => {
    assert.match(source, /createReview/);
    assert.match(source, /updateReview/);
    assert.match(source, /setPublication/);
    assert.match(source, /orderDetailId/);
    assert.match(source, /expectedVersion/);
  });

  it('does not leak internal workflow vocabulary to customers', () => {
    assert.doesNotMatch(source, /Customer publication|Staff moderation|Phiên bản/);
  });
});
