const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const SRC = join(__dirname, '..');

function source(relativePath) {
  const absolutePath = join(SRC, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
}

function allFulfillmentSource() {
  return [
    source('services/fulfillment.service.js'),
    source('services/fulfillmentCommand.service.js'),
    source('services/deliveryResolution.service.js'),
  ].join('\n');
}

describe('SL-004 CR-001 cross-slice acceptance', () => {
  it('CR AT-205/206 preserves one timely after-sales hold and blocks payout from Delivered + Unpaid alone', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /codDiscrepancy|CodDiscrepancy/,
      'CR AT-205 RED: physical delivery does not create the discrepancy fact consumed by the held-case seam',
    );
    assert.match(
      source('services/returnRefund.service.js'),
      /AwaitingCODReconciliation/,
      'CR AT-205: Return/Refund must preserve the timely COD hold',
    );
    assert.doesNotMatch(
      fulfillmentSource,
      /codDiscrepancy[\s\S]{0,500}(createRefund|upsertRefund|payout)/i,
      'CR AT-206: physical delivery alone must not open Refund/payout readiness',
    );
  });

  it('CR AT-207/208 uses Customer collection time for Paid/CompletedSale and keeps unresolved evidence open', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /collectionTiming/,
      'CR AT-207 RED: fulfillment cannot distinguish collection at delivery from collection later',
    );
    assert.match(
      fulfillmentSource + source('services/codReconciliation.service.js'),
      /completedSaleAt/,
      'CR AT-207 RED: collection evidence is not joined to immutable CompletedSale time',
    );
    assert.match(
      fulfillmentSource,
      /Open/,
      'CR AT-208 RED: incomplete/contradictory collection evidence has no explicit non-terminal result',
    );
  });

  it('CR AT-215/216 creates an independent failed-delivery obligation and leaves aggregate settlement false', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /FAILED_DELIVERY/,
      'CR AT-215 RED: failed delivery cannot create its own obligation identity',
    );
    assert.match(
      fulfillmentSource,
      /moneyObligationsSettled:\s*false/,
      'CR AT-216 RED: failed-delivery Refund readiness does not keep aggregate obligations unsettled',
    );
    assert.doesNotMatch(
      fulfillmentSource,
      /paymentStatus:\s*'Refund(?:Pending|ed)'/,
      'CR AT-215/216: Refund lifecycle must not overwrite primary Payment',
    );
  });

  it('CR AT-217 deduplicates delivery-failure command, obligation, movement, event and notification identities', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /idempotentReplay/,
      'CR AT-217 RED: duplicate failed-delivery command cannot return the existing result',
    );
    assert.match(
      fulfillmentSource,
      /obligationKey/,
      'CR AT-217 RED: failed-delivery Refund obligation has no stable identity',
    );
    assert.match(
      fulfillmentSource,
      /identityKey/,
      'CR AT-217 RED: notification handoff has no stable outbox identity',
    );
  });

  it('CR AT-218 exposes immutable CompletedSaleAt without changing SL-006 ranking implementation', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /completedSaleAt/,
      'CR AT-218 RED: SL-004 does not emit the immutable sale timestamp consumed by projections',
    );
    assert.doesNotMatch(
      fulfillmentSource,
      /bestSeller|catalog|sl006/i,
      'CR AT-218/219: SL-004 must not implement or mutate the SL-006 projection',
    );
  });

  it('CR AT-220 durably queues failed-attempt/reschedule and DeliveryFailed notifications once', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /DELIVERY_ATTEMPT_FAILED/,
      'CR AT-220 RED: failed-attempt event is not handed off durably',
    );
    assert.match(
      fulfillmentSource,
      /DELIVERY_FAILED/,
      'CR AT-220 RED: terminal failed-delivery event is not handed off durably',
    );
    assert.match(
      fulfillmentSource,
      /identityKey/,
      'CR AT-220 RED: notification retry cannot deduplicate the source event',
    );
  });

  it('CR AT-223 keeps full Customer collection Paid while Carrier settlement reconciles separately', () => {
    const codSource = source('services/codReconciliation.service.js');
    assert.match(codSource, /carrierSettlementAmount/, 'CR AT-223: Carrier settlement fact is missing');
    assert.match(codSource, /settlementReconciliationStatus/, 'CR AT-223: settlement work item is missing');
    assert.match(
      allFulfillmentSource(),
      /customerCollectedAmount/,
      'CR AT-223 RED: delivery does not establish the separate Customer collection fact',
    );
  });

  it('CR AT-224/225 creates Delivered + Unpaid discrepancy and only a derived positive recovery Refund after receipt', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.match(
      fulfillmentSource,
      /paymentStatus:\s*'Unpaid'/,
      'CR AT-224 RED: physical delivery without collection is not represented as Unpaid',
    );
    assert.match(
      fulfillmentSource,
      /codDiscrepancy|CodDiscrepancy/,
      'CR AT-224 RED: physical delivery exception has no discrepancy fact',
    );
    assert.match(
      source('services/codReconciliation.service.js'),
      /amount:\s*collected/,
      'CR AT-225: recovery Refund must be server-derived from verified Customer collection',
    );
  });

  it('CR AT-226 rejects split/installment input and replays Carrier collection/settlement identities', () => {
    const fulfillmentSource = allFulfillmentSource();
    assert.doesNotMatch(
      fulfillmentSource,
      /installment|splitCod|codPortion/i,
      'CR AT-226: SL-004 must not introduce split/installment COD',
    );
    assert.match(
      source('services/codReconciliation.service.js'),
      /idempotentReplay/,
      'CR AT-226: Carrier COD evidence must return its existing outcome',
    );
    assert.match(
      fulfillmentSource,
      /idempotentReplay/,
      'CR AT-226 RED: delivery-side evidence cannot return an existing outcome',
    );
  });
});
