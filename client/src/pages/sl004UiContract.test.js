import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createInventoryService } from '../services/inventoryService.js';
import { createOrderService } from '../services/orderService.js';
import { createStaffOrderService } from '../services/staffOrderService.js';

const staffOrder = readFileSync(new URL('./staff/StaffOrderDetailPage.jsx', import.meta.url), 'utf8');
const exportQueue = readFileSync(new URL('./warehouse/StockExportQueuePage.jsx', import.meta.url), 'utf8');
const exportDetail = readFileSync(new URL('./warehouse/StockExportDetailPage.jsx', import.meta.url), 'utf8');
const customerOrder = readFileSync(new URL('./customer/OrderDetailPage.jsx', import.meta.url), 'utf8');

const success = (data = {}) => ({
  ok: true,
  json: async () => ({ success: true, data }),
});

describe('SL-004 fulfillment and delivery UI contract', () => {
  it('AT-059/060/061 gives Warehouse one exact process/replay/failure command instead of approve/reject', async () => {
    let request;
    const inventory = createInventoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        request = { url, options };
        return success({ status: 'Completed', replay: false });
      },
    });

    await inventory.processStockExport('export-1', { idempotencyKey: 'export-process-001' });

    assert.equal(request.url, 'http://api.test/api/warehouse/stock-exports/export-1/process');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['Idempotency-Key'], 'export-process-001');
    assert.deepEqual(JSON.parse(request.options.body), {});
    assert.match(exportQueue, /cycle(Id|Key)|request(Id|Key)/);
    assert.match(exportDetail, /commandStatus|replay|AlreadyProcessed/);
    assert.match(exportDetail, /disabled=\{[^}]*processing/i);
    assert.match(exportDetail, /processingRef/);
    assert.match(exportDetail, /if \(processingRef\.current\) return/);
    assert.match(exportDetail, /processingRef\.current = true/);
    assert.doesNotMatch(exportDetail, /Approved|Rejected|Duyệt xuất kho|Từ chối/);
  });

  it('AT-062 lets only Staff submit an exact packing checklist after completed export', async () => {
    let request;
    const staff = createStaffOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        request = { url, options };
        return success({ status: 'Packed', packingRecordId: 'packing-1' });
      },
    });
    const checklist = [{ orderDetailId: 'line-1', quantity: 2, checked: true }];

    await staff.confirmPacking('order-1', { checklist, idempotencyKey: 'packing-001' });

    assert.equal(request.url, 'http://api.test/api/staff/orders/order-1/packing');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['Idempotency-Key'], 'packing-001');
    assert.deepEqual(JSON.parse(request.options.body), { checklist });
    assert.match(staffOrder, /checklist|packing/i);
    assert.match(staffOrder, /PackingRecord/);
    assert.doesNotMatch(staffOrder, /updateStatus\(order\.id, nextStatus\)/);
    assert.doesNotMatch(staffOrder, /requestStockExport/);
  });

  it('AT-063 requires carrier, reference, handoff time, and evidence for a dedicated shipment command', async () => {
    let request;
    const staff = createStaffOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        request = { url, options };
        return success({ shipmentId: 'shipment-1', orderStatus: 'Shipped' });
      },
    });
    const handoff = {
      carrierName: 'Carrier A', trackingReference: 'TRK-1',
      handedOffAt: '2026-07-24T10:00:00.000Z', evidenceReference: 'media-1',
      note: 'Bàn giao tại quầy số 2',
    };

    await staff.createShipment('order-1', { ...handoff, idempotencyKey: 'handoff-001' });

    assert.equal(request.url, 'http://api.test/api/staff/orders/order-1/shipments');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['Idempotency-Key'], 'handoff-001');
    assert.deepEqual(JSON.parse(request.options.body), handoff);
    assert.match(staffOrder, /carrierName/);
    assert.match(staffOrder, /trackingReference/);
    assert.match(staffOrder, /handedOffAt/);
    assert.match(staffOrder, /evidenceReference/);
    assert.match(staffOrder, /handoff\.note|Ghi chú bàn giao/);
    assert.equal(JSON.parse(request.options.body).note, 'Bàn giao tại quầy số 2');
  });

  it('AT-064/067 uses separate append-only attempt, delivery, correction, and dispute evidence actions', () => {
    assert.match(staffOrder, /AttemptFailed|attempt/i);
    assert.match(staffOrder, /Delivered|delivery/i);
    assert.match(staffOrder, /Correction|correction/i);
    assert.match(staffOrder, /Dispute|dispute/i);
    assert.match(staffOrder, /shipment.*history|history.*shipment/i);
    assert.doesNotMatch(staffOrder, /allowedNextStatuses/);
    assert.doesNotMatch(staffOrder, /updateStatus\(/);
  });

  it('AT-065/066 shows fixed COD expected amount and distinct collection/settlement evidence with no manual Paid action', () => {
    assert.match(staffOrder, /CODExpectedAmount|codExpectedAmount/);
    assert.match(staffOrder, /CustomerCollectedAmount|customerCollectedAmount/);
    assert.match(staffOrder, /CarrierSettlementAmount|carrierSettlementAmount|settlementReconciliationStatus/);
    assert.match(staffOrder, /codDiscrepancyStatus/);
    assert.match(staffOrder, /markCodCollected/);
    assert.match(staffOrder, /thu đủ COD|thu thiếu|không thu/i);
    assert.doesNotMatch(staffOrder, /amount:\s*Number\(|name="amount"/i);
  });

  it('AT-068 keeps returned-parcel classification exact and free of finance controls', async () => {
    let request;
    const inventory = createInventoryService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options) => {
        request = { url, options };
        return success({ receiptId: 'receipt-1' });
      },
    });
    const lines = [{ orderDetailId: 'line-1', receivedQuantity: 2, sellableQuantity: 1, damagedQuantity: 1 }];

    await inventory.recordReturnedParcelReceipt('shipment-1', { lines, idempotencyKey: 'receipt-001' });

    assert.equal(request.url, 'http://api.test/api/warehouse/shipments/shipment-1/returned-receipt');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['Idempotency-Key'], 'receipt-001');
    assert.deepEqual(JSON.parse(request.options.body), { lines });
    assert.doesNotMatch(exportDetail, /refundAmount|destinationReference|payout|paymentStatus/i);
  });

  it('AT-069 preserves primary payment and explains the terminal incident without rewriting Order status', () => {
    assert.match(staffOrder, /giữ.*Shipped|Shipped.*sự cố/i);
    assert.match(staffOrder, /MoneyObligationsSettled|refund.*Pending|FAILED_DELIVERY/i);
    assert.match(staffOrder, /ShippingFee|shippingFee/);
    assert.doesNotMatch(staffOrder, /Đã ghi nhận DeliveryFailed/);
    assert.doesNotMatch(staffOrder, /refundAmount|deduct.*shipping|shippingCharge/i);
  });

  it('AT-070/071 gives Customer only same-Order resend, wait, or derived terminal resolution for an incident', () => {
    assert.match(customerOrder, /deliveryIncident|incident/i);
    assert.match(customerOrder, /availableChoices/);
    assert.match(customerOrder, /AwaitingWarehouseReceipt/);
    assert.match(customerOrder, /Resend|gửi lại/i);
    assert.match(customerOrder, /Wait|chờ/i);
    assert.match(customerOrder, /TerminalRefund|hoàn tiền/i);
    assert.doesNotMatch(customerOrder, /replacementSku|SKU thay thế|newOrder|tạo đơn mới/i);
    assert.doesNotMatch(customerOrder, /shippingFee|shippingCharge|refundAmount/i);
  });

  it('AT-072 displays immutable destination versions and requires Customer/Carrier evidence for corrections', () => {
    assert.match(customerOrder, /destinationVersion|ShipmentDestinationVersion/);
    assert.match(customerOrder, /destination.*history|history.*destination|Lịch sử địa chỉ/i);
    assert.match(customerOrder, /destination.*correction|correction.*destination|Đính chính địa chỉ/i);
    assert.match(staffOrder, /carrier.*accept|accept.*carrier|Carrier evidence/i);
    assert.doesNotMatch(customerOrder, /setOrder\([^)]*shippingAddress|shippingAddress\s*=/);
  });

  it('AT-073 exposes a Customer-only fulfillment route with carrier/tracking/deadlines but no live map', async () => {
    let request;
    const orders = createOrderService({
      baseUrl: 'http://api.test/api',
      fetcher: async (url, options = {}) => {
        request = { url, options };
        return success({});
      },
    });

    await orders.getFulfillment('order-1');

    assert.equal(request.url, 'http://api.test/api/orders/order-1/fulfillment');
    assert.equal(request.options.method || 'GET', 'GET');
    assert.match(customerOrder, /fulfillment|shipment/i);
    assert.match(customerOrder, /carrierName/);
    assert.match(customerOrder, /trackingReference/);
    assert.match(customerOrder, /returnDeadlineAt|exchangeDeadlineAt|deadline/i);
    assert.match(customerOrder, /không.*bản đồ|không.*theo dõi trực tiếp/i);
    assert.doesNotMatch(customerOrder, /liveMap|mapbox|google\.maps|geolocation/i);
  });

  it('AT-074 locks pending actions and preserves field-specific failure and replay feedback without export/Packed notification copy', () => {
    const combined = [staffOrder, exportQueue, exportDetail, customerOrder].join('\n');

    assert.match(combined, /submitting|processing|pending/i);
    assert.match(combined, /disabled=\{[^}]*submitting|disabled=\{[^}]*processing/i);
    assert.match(combined, /fieldErrors|carrierName.*error|trackingReference.*error/i);
    assert.match(combined, /idempotentReplay|AlreadyProcessed|replay/i);
    assert.doesNotMatch(combined, /đã xuất kho.*(email|thông báo)|Packed.*(email|thông báo)/i);
  });

  it('shows Completed replay feedback only for a Completed export and rotates a confirmed Failed command for retry', () => {
    assert.match(exportDetail, /resolveStockExportFeedback/);
    assert.match(exportDetail, /applyFeedback\(resolveStockExportFeedback\(\{ result, latest \}\)\)/);
    assert.match(exportDetail, /applyFeedback\(resolveStockExportFeedback\(\{ latest, requestError: err \}\)\)/);
    assert.match(exportDetail, /if \(feedback\.rotateKey\) commandKey\.current = key\(\)/);
    assert.doesNotMatch(exportDetail, /result\.stockExport\?\.status === 'Failed'[\s\S]*commandKey\.current = key\(\)/);
  });
});
