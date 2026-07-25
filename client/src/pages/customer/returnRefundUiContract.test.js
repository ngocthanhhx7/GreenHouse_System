import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const orderDetailSource = readFileSync(new URL('./OrderDetailPage.jsx', import.meta.url), 'utf8');
const historySource = readFileSync(new URL('./ReturnRefundPage.jsx', import.meta.url), 'utf8');

describe('Customer return/refund UI contract', () => {
  it('shows the COD reconciliation hold without asking for an amount', () => {
    assert.match(orderDetailSource, /codDiscrepancyStatus|đối soát COD/i);
    assert.doesNotMatch(orderDetailSource, /refundAmount|Số tiền hoàn/);
    assert.match(orderDetailSource, /returnSubmissionInFlight/);
    assert.match(orderDetailSource, /disabled=\{isSubmittingReturn\}/);
    assert.match(orderDetailSource, /đang được xử lý/i);
  });

  it('does not show a speculative refund amount in request history', () => {
    assert.doesNotMatch(historySource, /Số tiền hoàn|formatCurrency\(item\.refundAmount\)/);
  });

  it('allows a cancellation refund that is ready for payout to collect a destination', () => {
    assert.match(historySource, /ReadyForRefund/);
    assert.match(historySource, /submitDestination/);
  });

  it('uses the canonical bank catalog and never asks a Customer for BIN, PIN, OTP, password, or CVV', () => {
    assert.match(historySource, /listBanks/);
    assert.match(historySource, /<select[^>]+bank-/);
    assert.match(historySource, /bankCode/);
    assert.match(historySource, /GreenHome không bao giờ yêu cầu mã PIN, OTP, mật khẩu hoặc CVV/);
    assert.doesNotMatch(historySource, /form\.bankBin|form\.bankName|Mã BIN ngân hàng/);
    assert.match(historySource, /bankStatus === 'loading'/);
    assert.match(historySource, /bankStatus === 'error'/);
    assert.match(historySource, /bankStatus === 'empty'/);
    assert.match(historySource, /Tải lại danh sách ngân hàng/);
  });

  it('locks rapid submits synchronously, reuses retry identity, and clears sensitive values only after success', () => {
    assert.match(historySource, /useRef/);
    assert.match(historySource, /actionInFlightRef/);
    assert.match(historySource, /destinationKeysRef/);
    assert.match(historySource, /clearSensitiveDestinationForm/);
    assert.match(historySource, /accountNumber:\s*''/);
    assert.match(historySource, /accountHolderName:\s*''/);
    assert.match(historySource, /aria-live="polite"/);
  });
});
