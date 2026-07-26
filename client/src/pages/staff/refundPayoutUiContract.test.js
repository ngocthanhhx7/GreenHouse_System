import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const page = readFileSync(new URL('./ReturnRefundDetailPage.jsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../services/returnRefundService.js', import.meta.url), 'utf8');

describe('staff refund payout UI contract', () => {
  it('uses only authoritative payout capabilities and mounts exactly one selected payout action', () => {
    assert.match(page, /getRefundPayoutUiState\(request, payoutMethod\)/);
    assert.match(page, /payout\.canStartPayOS/);
    assert.match(page, /payout\.canRecordManualSuccess/);
    assert.match(page, /payoutUi\.showPayOS/);
    assert.match(page, /payoutUi\.showManual/);
    assert.match(page, /<fieldset className="refund-payout-method"/);
    assert.doesNotMatch(page, /bankBin|Mã BIN|refundAmount:/i);
  });

  it('does not allow a new payout action while Processing or Unknown and reconciles the exact operation key', () => {
    assert.match(page, /payoutUi\.showReconciliation/);
    assert.match(page, /payoutUi\.showPayOSReconciliation/);
    assert.match(page, /beginReconciliation\(id, operationKey, reconciliation\)/);
    assert.match(page, /beginPayOSReconciliation\(id\)/);
    assert.match(page, /Mã lệnh đang khóa hồ sơ/);
    assert.match(page, /reconcilePayout\(id, payload\)/);
    assert.match(page, /reconcilePayOSPayout\(id\)/);
    assert.match(service, /\/payout-reconciliation/);
  });

  it('keeps payout commands single-flight, idempotent, and reloads canonical state after a result or conflict', () => {
    assert.match(page, /controllerRef\.current\?\.beginPayOS/);
    assert.match(page, /controller\.settle\(command, \{ succeeded: canonicalSuccess \}\)/);
    assert.match(page, /const reloaded = await loadRequest\(controller\)/);
    assert.match(page, /await loadRequest\(controller\);[\s\S]*setError\(conflictGuidance\(err\)\)/);
    assert.match(page, /controller\.dispose\(\)/);
  });

  it('requires evidence, attestation and a bounded reconciliation note for manual and reconciliation paths', () => {
    assert.match(page, /minLength="20" maxLength="1000"/);
    assert.match(page, /I?Tôi xác nhận đã kiểm tra chứng từ/);
    assert.match(page, /Tôi xác nhận kết quả đối soát này thuộc đúng mã lệnh/);
    assert.match(page, /Hệ thống tự tính giá trị hoàn tiền/);
  });

  it('renders a Completed successful refund as read-only with no incident mutation control', () => {
    assert.match(page, /\['Received', 'ReadyForRefund', 'Completed'\]\.includes\(request\.status\)/);
    assert.match(page, /payoutUi\.readOnly/);
    assert.doesNotMatch(page, /reportPayoutIncident|incidentReason|Báo cáo chi trả sai đích/);
  });

  it('keeps ReadyForRefund cancellation obligations actionable through the same payout panel', () => {
    assert.match(page, /\['Received', 'ReadyForRefund', 'Completed'\]\.includes\(request\.status\)/);
    assert.match(page, /request\.destination\?\.status === 'Verified'/);
  });

  it('guards every post-await task state write with the captured route command', () => {
    assert.match(page, /const isCurrent = \(\) => controllerRef\.current === controller/);
    assert.match(page, /if \(!isCurrent\(\)\) return null;[\s\S]*setMessage/);
    assert.match(page, /await loadRequest\(controller\);[\s\S]*if \(isCurrent\(\)\) setError/);
    assert.match(page, /if \(isCurrent\(\)\) \{[\s\S]*setBusy\(false\)/);
  });
});
