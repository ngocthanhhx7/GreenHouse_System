import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const customerList = source('./customer/ExchangeListPage.jsx');
const customerDetail = source('./customer/ExchangeDetailPage.jsx');
const staffQueue = source('./staff/ExchangeQueuePage.jsx');
const staffDetail = source('./staff/ExchangeDetailPage.jsx');
const warehouseDetail = source('./warehouse/ExchangeInspectionPage.jsx');
const warehouseQueue = source('./warehouse/ExchangeQueuePage.jsx');
const orderDetail = source('./customer/OrderDetailPage.jsx');
const staffReturnQueue = source('./staff/ReturnRefundQueuePage.jsx');

describe('after-sales source contract', () => {
  it('applies Vietnamese enum translators to all Exchange actor surfaces', () => {
    assert.match(customerList, /translateExchangeStatus\(item\.status\)/);
    assert.match(customerDetail, /translateExchangeStatus\(request\.status\)/);
    assert.match(customerDetail, /translateShipmentDirection\(shipment\.direction\)/);
    assert.match(customerDetail, /translateShipmentStatus\(shipment\.status\)/);
    assert.match(staffQueue, /translateExchangeStatus\(/);
    assert.match(staffDetail, /translateExchangeStatus\(request\.status\)/);
    assert.match(staffDetail, /translateShippingPayer\(request\.shippingPayer\)/);
    assert.match(warehouseDetail, /translateExchangeStatus\(request\.status\)/);
    assert.match(warehouseQueue, /translateExchangeStatus\(item\.status\)/);
    assert.match(staffDetail, /translateExchangeResponsibility\(request\.responsibility\)/);
    assert.match(staffDetail, /translateShipmentEventType\(item\.eventType\)/);
  });

  it('uses pure workflow predicates instead of broad incident status checks', () => {
    assert.match(customerDetail, /workflowActions\.canWaitOrConvert/);
    assert.match(customerDetail, /workflowActions\.canCancel/);
    assert.doesNotMatch(customerDetail, /\[['"]Submitted['"],\s*['"]AwaitingExactStockChoice['"],\s*['"]WaitingForExactStock['"]\]\.includes\(request\.status\)/);
    assert.match(staffDetail, /workflowActions\.canRetryReservation/);
    assert.match(staffDetail, /workflowActions\.canResend/);
    assert.match(warehouseDetail, /workflowActions\.canCreateOutbound/);
    assert.doesNotMatch(warehouseDetail, /request\.status\s*===\s*['"]OutboundFulfillment['"]/);
  });

  it('renders the typed server conflict action href and blocks the losing form', () => {
    assert.match(orderDetail, /AFTER_SALES_CASE_ACTIVE/);
    assert.match(orderDetail, /err\.data\?\.action\?\.href/);
    assert.match(orderDetail, /setActiveCase/);
    assert.match(orderDetail, /requestReturnRefund[\s\S]*catch \(err\)[\s\S]*handleAfterSalesConflict\(err\)/);
    assert.match(orderDetail, /!activeCase && order\.orderStatus === ['"]Delivered['"]/);
  });

  it('contains all required staff filter states', () => {
    assert.match(staffQueue, /CODRecoveryInProgress/);
    assert.match(staffQueue, /ClosedByCODRecovery/);
    [
      'Pending',
      'AwaitingInspection',
      'ReadyForRefund',
      'CODRecoveryInProgress',
      'ClosedByCODRecovery',
    ].forEach((status) => assert.match(staffReturnQueue, new RegExp(status)));
  });

  it('shows expired replacement deadlines and reasons without opening a disabled form', () => {
    assert.match(orderDetail, /replacement-expiry-summary/);
    assert.match(orderDetail, /role="status"/);
    assert.match(orderDetail, /aria-live="polite"/);
    assert.match(orderDetail, /currentReplacementExchangeUnits\.map/);
    assert.match(orderDetail, /disabled=\{!unit\.eligible\}/);
    assert.match(orderDetail, /unit\.exchangeDeadlineAt/);
    assert.match(orderDetail, /unit\.reason/);
    assert.match(orderDetail, /disabled=\{!eligibleReplacementUnits\.length\}/);
  });

  it('recomputes exact deadlines while open and guards before evidence upload', () => {
    assert.match(orderDetail, /setTimeout/);
    assert.match(orderDetail, /getExchangeSubmissionGuard/);
    const guardIndex = orderDetail.indexOf('getExchangeSubmissionGuard({', orderDetail.indexOf('async function requestExchange'));
    const uploadIndex = orderDetail.indexOf('exchangeService.uploadEvidence', guardIndex);
    assert.ok(guardIndex >= 0 && uploadIndex > guardIndex);
  });

  it('closes Return at its exact deadline and rechecks before Return evidence upload', () => {
    assert.match(orderDetail, /order\?\.returnDeadlineAt/);
    assert.match(orderDetail, /getReturnAction\(order, deadlineNow\)/);
    assert.match(orderDetail, /afterSalesMode === 'RETURN' && !returnAction\.disabled/);
    assert.match(orderDetail, /returnAction\.reason/);
    const guardIndex = orderDetail.indexOf('getReturnAction(order, currentNow)', orderDetail.indexOf('async function requestReturnRefund'));
    const uploadIndex = orderDetail.indexOf('returnRefundService.uploadEvidence', guardIndex);
    assert.ok(guardIndex >= 0 && uploadIndex > guardIndex);
  });
});
