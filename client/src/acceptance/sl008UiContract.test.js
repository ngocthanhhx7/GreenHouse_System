import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createReviewService } from '../services/reviewService.js';
import { createSupportService } from '../services/supportService.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = (relativePath) => {
  const filename = path.join(dirname, '..', relativePath);
  return existsSync(filename) ? readFileSync(filename, 'utf8') : '/* MISSING SL-008 COMPONENT */';
};
const success = (data) => ({ ok: true, json: async () => ({ success: true, data }) });

describe('SL-008 UI source-contract acceptance', () => {
  it('AT-150/154/156 mounts ProductReviewPanel from ProductDetail with no raw Order/ObjectId field, rating, optional text counter, and public-safe DTOs', () => {
    const detail = source('pages/public/ProductDetailPage.jsx');
    const panel = source('components/review/ProductReviewPanel.jsx');

    assert.match(detail, /ProductReviewPanel/);
    assert.match(panel, /rating/);
    assert.match(panel, /0\s*\/\s*1000|1000/);
    assert.match(panel, /optional/i);
    assert.doesNotMatch(panel, /<input[^>]+(orderId|orderDetailId|ObjectId)/i);
    assert.doesNotMatch(panel, /customerId|email|phone|moderationReason|assignedTo/i);
  });

  it('AT-155/157/159 keeps Customer publication distinct from Staff moderation and presents immutable public Review history safely', () => {
    const customerPanel = source('components/review/ProductReviewPanel.jsx');
    const staffReview = source('pages/staff/ReviewModerationPage.jsx');

    assert.match(customerPanel, /Published/);
    assert.match(customerPanel, /Withdrawn/);
    assert.match(staffReview, /Allowed/);
    assert.match(staffReview, /HiddenByStaff/);
    assert.match(staffReview, /reason/i);
    assert.doesNotMatch(customerPanel, /moderationReason|staffId|customerId|orderDetailId/i);
  });

  it('AT-158/160 uses server paging and aggregate metadata while Review command services send Idempotency-Key and expectedVersion', async () => {
    let request;
    const review = createReviewService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => { request = { url, options }; return success({ id: 'review-1', version: 1 }); },
    });

    assert.equal(typeof review.updateReview, 'function');
    await review.updateReview('review-1', { rating: 5, content: 'Updated', expectedVersion: 0 }, { idempotencyKey: 'review-update-0001' });
    assert.equal(request.options.headers['Idempotency-Key'], 'review-update-0001');
    assert.equal(JSON.parse(request.options.body).expectedVersion, 0);
    assert.match(source('components/review/PublicReviewList.jsx'), /pageSize|totalPages/);
    assert.match(source('components/review/PublicReviewList.jsx'), /averageRating|average.*toFixed\(1\)/i);
  });

  it('AT-161/162/163/164 gives Customer Support only authorized type/reference selectors, length counters, and privacy guidance', () => {
    const support = source('pages/customer/SupportPage.jsx');

    assert.match(support, /Order.*Payment.*ReturnRefund.*Exchange.*Product.*Account.*Other/s);
    assert.match(support, /subject[\s\S]{0,160}(5|120)/i);
    assert.match(support, /initialMessage|message/);
    assert.match(support, /10\s*\/\s*2000|2000/);
    assert.match(support, /privacy|sensitive|nhạy cảm/i);
    assert.match(support, /select[^>]+(order|product)|Order.*Product/s);
    assert.doesNotMatch(support, /<input[^>]+(?:name=|id=)["']?(?:orderId|productId|ObjectId)/i);
  });

  it('AT-165/171/172 gives Customer append-only messages, New-only withdrawal, and a deadline-aware reopen action', () => {
    const support = source('pages/customer/SupportPage.jsx');

    assert.match(support, /message/i);
    assert.match(support, /Withdraw|Hủy/i);
    assert.match(support, /status\s*===\s*['"]New['"]/);
    assert.match(support, /reopen|Mở lại/i);
    assert.match(support, /resolvedAt|72/);
  });

  it('AT-166/167/168/169/170 gives Staff server-paged filters, claim, current-assignee-only controls, Active transfer, and priority reasons', () => {
    const queue = source('pages/staff/SupportQueuePage.jsx');
    const detail = source('pages/staff/SupportDetailPage.jsx');

    assert.match(queue, /pageSize|totalPages/);
    assert.match(queue, /status|priority|assignee/i);
    assert.match(queue, /claim/i);
    assert.match(detail, /current.*assignee|isAssignee|assignedTo/i);
    assert.match(detail, /transfer/i);
    assert.match(detail, /Active.*Staff|staff.*active/i);
    assert.match(detail, /Low.*Normal.*High.*Urgent/s);
    assert.match(detail, /priorityReason|reason/i);
  });

  it('AT-170/172 shows final response and disabled-assignee recovery without exposing internal identifiers', () => {
    const detail = source('pages/staff/SupportDetailPage.jsx');

    assert.match(detail, /final response|phản hồi cuối|resolve/i);
    assert.match(detail, /assignee.*cleared|người xử lý.*không còn hoạt động|recovery/i);
    assert.doesNotMatch(detail, /ObjectId|customerId|email|phone/i);
  });

  it('AT-173/174 sends Support commands with Idempotency-Key and expectedVersion; Admin and Warehouse receive no SL-008 routes or controls', async () => {
    let request;
    const support = createSupportService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => { request = { url, options }; return success({ id: 'ticket-1', version: 1 }); },
    });

    assert.equal(typeof support.createRequest, 'function');
    await support.createRequest({ type: 'Other', subject: 'Need account help', initialMessage: 'Please help with access.', expectedVersion: 0 }, { idempotencyKey: 'support-create-0001' });
    assert.equal(request.options.headers['Idempotency-Key'], 'support-create-0001');
    assert.equal(JSON.parse(request.options.body).expectedVersion, 0);
    const app = source('App.jsx');
    assert.doesNotMatch(app, /path="admin\/(?:reviews|support)/);
    assert.doesNotMatch(app, /path="warehouse\/(?:reviews|support)/);
  });
});
