import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const staffOrderSource = readFileSync(new URL('./StaffOrderDetailPage.jsx', import.meta.url), 'utf8');
const refundDetailSource = readFileSync(new URL('./ReturnRefundDetailPage.jsx', import.meta.url), 'utf8');

describe('Staff COD and refund UI contract', () => {
  it('does not let Staff manually mark COD as collected', () => {
    assert.doesNotMatch(staffOrderSource, /markCodCollected|Đã thu COD/);
    assert.doesNotMatch(staffOrderSource, /goodsRecoveryEvidenceId/);
    assert.match(staffOrderSource, /codDiscrepancyStatus/);
    assert.match(staffOrderSource, /codRecoveryReceiptId/);
  });

  it('does not render or send an editable refund amount', () => {
    assert.doesNotMatch(refundDetailSource, /id="refundAmount"|Number\(form\.refundAmount\)|refundAmount:/);
    assert.match(refundDetailSource, /hệ thống tự tính|Hệ thống tự tính/);
  });
});
