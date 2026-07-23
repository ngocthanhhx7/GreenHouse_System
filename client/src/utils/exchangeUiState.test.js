import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyReplacementExchangeUnits,
  getOriginalExchangeAction,
  getReturnAction,
  getExchangeSubmissionGuard,
  getExchangeWorkflowActions,
  getExchangeWorkflowMessage,
} from './exchangeUiState.js';

describe('Exchange UI state', () => {
  const now = new Date('2026-07-23T10:00:00.000Z');

  it('always exposes the original action and disables it immediately after its exact deadline', () => {
    const exact = getOriginalExchangeAction(
      { exchangeDeadlineAt: '2026-07-23T10:00:00.000Z' },
      now
    );
    const late = getOriginalExchangeAction(
      { exchangeDeadlineAt: '2026-07-23T09:59:59.999Z' },
      now
    );

    assert.equal(exact.visible, true);
    assert.equal(exact.disabled, false);
    assert.equal(late.visible, true);
    assert.equal(late.disabled, true);
    assert.match(late.reason, /hết hạn|quá hạn/i);
    assert.equal(late.deadlineAt, '2026-07-23T09:59:59.999Z');
  });

  it('keeps Return open at the exact deadline and disables it one millisecond later', () => {
    const exact = getReturnAction(
      { returnDeadlineAt: '2026-07-23T10:00:00.000Z' },
      now,
    );
    const late = getReturnAction(
      { returnDeadlineAt: '2026-07-23T10:00:00.000Z' },
      '2026-07-23T10:00:00.001Z',
    );

    assert.equal(exact.disabled, false);
    assert.equal(late.disabled, true);
    assert.equal(late.deadlineAt, '2026-07-23T10:00:00.000Z');
    assert.match(late.reason, /quá hạn trả hàng/i);
    assert.match(late.reason, /23|2026/);
  });

  it('classifies mixed replacement units independently by delivery outcome and per-unit deadline', () => {
    const result = classifyReplacementExchangeUnits([
      {
        id: 'eligible',
        orderId: 'order-1',
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: '2026-07-23T10:00:00.000Z',
        eligibleForReplacementExchange: true,
      },
      {
        id: 'expired',
        orderId: 'order-1',
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: '2026-07-23T09:59:59.999Z',
        eligibleForReplacementExchange: true,
      },
      {
        id: 'in-transit',
        orderId: 'order-1',
        outcome: 'ReplacementShipped',
        exchangeDeadlineAt: '2026-07-24T10:00:00.000Z',
        eligibleForReplacementExchange: true,
      },
      {
        id: 'foreign',
        orderId: 'order-2',
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: '2026-07-24T10:00:00.000Z',
        eligibleForReplacementExchange: true,
      },
    ], 'order-1', now);

    assert.deepEqual(result.map(({ id, eligible }) => [id, eligible]), [
      ['eligible', true],
      ['expired', false],
    ]);
    assert.match(result[1].reason, /hết hạn|quá hạn/i);
  });

  it('excludes backend-ineligible historic replacement parents from selectable units', () => {
    const result = classifyReplacementExchangeUnits([
      {
        id: 'historic-parent',
        orderId: 'order-1',
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: '2026-07-24T10:00:00.000Z',
        eligibleForReplacementExchange: false,
      },
      {
        id: 'lineage-leaf',
        orderId: 'order-1',
        outcome: 'ReplacementDelivered',
        exchangeDeadlineAt: '2026-07-24T10:00:00.000Z',
        eligibleForReplacementExchange: true,
      },
    ], 'order-1', now);

    assert.deepEqual(result.map(({ id, eligible }) => [id, eligible]), [
      ['historic-parent', false],
      ['lineage-leaf', true],
    ]);
    assert.match(result[0].reason, /đã được dùng|chu kỳ sau/i);
  });

  it('uses exact wait, convert, retry, resend, and outbound predicates', () => {
    assert.deepEqual(getExchangeWorkflowActions({
      status: 'AwaitingExactStockChoice',
      waitingFor: 'INITIAL_APPROVAL',
    }), {
      canWaitOrConvert: true,
      canRetryReservation: false,
      canResend: false,
      canCreateOutbound: false,
    });
    assert.equal(getExchangeWorkflowActions({
      status: 'WaitingForExactStock',
      waitingFor: 'INITIAL_APPROVAL',
    }).canRetryReservation, true);
    assert.equal(getExchangeWorkflowActions({
      status: 'WaitingForExactStock',
      waitingFor: 'INCIDENT_RESEND',
    }).canResend, true);
    assert.equal(getExchangeWorkflowActions({
      status: 'AwaitingExactStockChoice',
      waitingFor: 'INCIDENT_RESEND',
    }).canResend, false);
    assert.equal(getExchangeWorkflowActions({
      status: 'DeliveryIncident',
      waitingFor: 'INCIDENT_RESEND_IN_TRANSIT',
    }).canResend, false);
    assert.equal(getExchangeWorkflowActions({
      status: 'DeliveryIncident',
      waitingFor: 'REJECTED_ORIGINAL_RECONCILIATION',
    }).canWaitOrConvert, false);
    assert.equal(getExchangeWorkflowActions({
      status: 'DeliveryIncident',
      waitingFor: 'REJECTED_ORIGINAL_RECONCILIATION',
    }).canCreateOutbound, false);
    assert.equal(getExchangeWorkflowActions({
      status: 'OutboundFulfillment',
      waitingFor: '',
    }).canCreateOutbound, true);

    [
      { status: 'OutboundFulfillment', waitingFor: '' },
      { status: 'ReplacementShipped', waitingFor: '' },
      { status: 'DeliveryIncident', waitingFor: '' },
      { status: 'DeliveryIncident', waitingFor: 'INCIDENT_RESEND' },
    ].forEach((request) => {
      assert.equal(
        getExchangeWorkflowActions(request).canCreateOutbound,
        true,
        `${request.status}/${request.waitingFor} must allow outbound fulfillment`,
      );
    });

    [
      { status: 'DeliveryIncident', waitingFor: 'REJECTED_ORIGINAL_RECONCILIATION' },
      { status: 'DeliveryIncident', waitingFor: 'INCIDENT_RESEND_IN_TRANSIT' },
      { status: 'AwaitingExactStockChoice', waitingFor: 'INCIDENT_RESEND' },
      { status: 'WaitingForExactStock', waitingFor: 'INCIDENT_RESEND' },
      { status: 'AwaitingExactStockChoice', waitingFor: 'INITIAL_APPROVAL' },
      { status: 'WaitingForExactStock', waitingFor: 'INITIAL_APPROVAL' },
      { status: 'Submitted', waitingFor: '' },
    ].forEach((request) => {
      assert.equal(
        getExchangeWorkflowActions(request).canCreateOutbound,
        false,
        `${request.status}/${request.waitingFor} must not allow outbound fulfillment`,
      );
    });
  });

  it('rechecks original and replacement deadlines with the submit-time clock', () => {
    const original = getExchangeSubmissionGuard({
      mode: 'ORIGINAL_EXCHANGE',
      order: { exchangeDeadlineAt: '2026-07-23T10:00:00.000Z' },
      orderId: 'order-1',
    }, '2026-07-23T10:00:00.001Z');
    assert.equal(original.allowed, false);
    assert.match(original.reason, /23|2026|hạn/i);

    const replacement = getExchangeSubmissionGuard({
      mode: 'REPLACEMENT_EXCHANGE',
      orderId: 'order-1',
      selectedReplacementUnitIds: ['replacement-1'],
      units: [{
        id: 'replacement-1',
        orderId: 'order-1',
        outcome: 'ReplacementDelivered',
        eligibleForReplacementExchange: true,
        exchangeDeadlineAt: '2026-07-23T10:00:00.000Z',
      }],
    }, '2026-07-23T10:00:00.001Z');
    assert.equal(replacement.allowed, false);
    assert.match(replacement.reason, /23|2026|hạn/i);
  });

  it('gives clear transit and rejected-original reconciliation messages', () => {
    assert.match(
      getExchangeWorkflowMessage({ waitingFor: 'REJECTED_ORIGINAL_RECONCILIATION' }),
      /hàng gốc|đối soát/i
    );
    assert.match(
      getExchangeWorkflowMessage({ waitingFor: 'INCIDENT_RESEND_IN_TRANSIT' }),
      /đang vận chuyển|gửi lại/i
    );
  });
});
