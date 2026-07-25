import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const staffOrderSource = readFileSync(new URL('./StaffOrderDetailPage.jsx', import.meta.url), 'utf8');
const refundDetailSource = readFileSync(new URL('./ReturnRefundDetailPage.jsx', import.meta.url), 'utf8');

describe('Staff COD and refund UI contract', () => {
  it('allows evidence-backed demo COD reconciliation without an editable amount and hides it in production', () => {
    assert.match(staffOrderSource, /OperationalEvidenceUploader/);
    assert.match(staffOrderSource, /codCollectionResult/);
    assert.match(staffOrderSource, /COLLECTED/);
    assert.match(staffOrderSource, /NOT_COLLECTED/);
    assert.match(staffOrderSource, /fulfillment\.capabilities\?\.manualCodReconciliation\s*===\s*true/);
    assert.doesNotMatch(staffOrderSource, /import\.meta\.env\.(?:MODE|PROD)/);
    assert.doesNotMatch(staffOrderSource, /codAmount|customerCollectedAmount\s*:|amount\s*:\s*Number\(/);
    assert.doesNotMatch(staffOrderSource, /goodsRecoveryEvidenceId/);
    assert.match(staffOrderSource, /codDiscrepancyStatus/);
    assert.match(staffOrderSource, /codRecoveryReceiptId/);
  });

  it('uses Vietnamese delivery/COD labels and sends at most five uploaded evidence images', () => {
    assert.match(staffOrderSource, /Giao thành công/);
    assert.match(staffOrderSource, /Không thể giao/);
    assert.match(staffOrderSource, /Thử giao thất bại/);
    assert.match(staffOrderSource, /Đã thu đủ COD/);
    assert.match(staffOrderSource, /Chưa thu được COD/);
    assert.match(staffOrderSource, /evidenceReferences/);
    assert.match(staffOrderSource, /slice\(0,\s*5\)/);
  });

  it('shows saved signed evidence previews and field-specific delivery validation', () => {
    assert.match(staffOrderSource, /entry\.evidenceReferences/);
    assert.match(staffOrderSource, /resolveMediaUrl/);
    for (const field of ['occurredAt', 'evidenceReferences', 'codCollectionResult', 'reason']) {
      assert.match(staffOrderSource, new RegExp(`fieldErrors\\.${field}|fieldErrors\\[['"]${field}['"]\\]`));
    }
    assert.match(staffOrderSource, /CUSTOMER_UNREACHABLE|CUSTOMER_REFUSED/);
  });

  it('does not render or send an editable refund amount', () => {
    assert.doesNotMatch(refundDetailSource, /id="refundAmount"|Number\(form\.refundAmount\)|refundAmount:/);
    assert.match(refundDetailSource, /hệ thống tự tính|Hệ thống tự tính/);
  });

  it('locks Staff confirm/cancel commands and supplies a stable idempotency key', () => {
    assert.match(staffOrderSource, /idempotencyKey/);
    assert.match(staffOrderSource, /disabled=\{.*submitting/s);
    assert.match(staffOrderSource, /submittingRef\.current/);
    assert.match(staffOrderSource, /commandKeys\.current\.delete/);
    assert.match(
      staffOrderSource,
      /const reloaded = await loadOrder\(\);[\s\S]*if \(reloaded\) onSuccess\?\.\(result\)/,
    );
  });
});
