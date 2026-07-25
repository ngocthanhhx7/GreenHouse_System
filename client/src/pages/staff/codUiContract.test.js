import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const staffOrderSource = readFileSync(new URL('./StaffOrderDetailPage.jsx', import.meta.url), 'utf8');
const refundDetailSource = readFileSync(new URL('./ReturnRefundDetailPage.jsx', import.meta.url), 'utf8');

describe('Staff COD and refund UI contract', () => {
  it('lets Staff record manual COD evidence without choosing a normal payment amount', () => {
    assert.match(staffOrderSource, /markCodCollected/);
    assert.match(staffOrderSource, /Ghi nhận.*COD|thu đủ COD/i);
    assert.match(staffOrderSource, /CODExpectedAmount|codExpectedAmount/);
    assert.doesNotMatch(staffOrderSource, /goodsRecoveryEvidenceId/);
    assert.match(staffOrderSource, /codDiscrepancyStatus/);
    assert.match(staffOrderSource, /codRecoveryReceiptId/);
  });

  it('does not render or send an editable refund amount', () => {
    assert.doesNotMatch(refundDetailSource, /id="refundAmount"|Number\(form\.refundAmount\)|refundAmount:/);
    assert.match(refundDetailSource, /hệ thống tự tính|Hệ thống tự tính/);
  });

  it('locks Staff confirm/cancel commands and supplies a stable idempotency key', () => {
    assert.match(staffOrderSource, /idempotencyKey/);
    assert.match(staffOrderSource, /disabled=\{.*submitting/s);
    assert.match(staffOrderSource, /submittingRef\.current/);
  });
});
