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
});
