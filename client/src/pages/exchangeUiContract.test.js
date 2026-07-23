import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const orderDetail = readFileSync(new URL('./customer/OrderDetailPage.jsx', import.meta.url), 'utf8');
const customerDetail = readFileSync(new URL('./customer/ExchangeDetailPage.jsx', import.meta.url), 'utf8');
const staffDetail = readFileSync(new URL('./staff/ExchangeDetailPage.jsx', import.meta.url), 'utf8');
const warehouseInspection = readFileSync(new URL('./warehouse/ExchangeInspectionPage.jsx', import.meta.url), 'utf8');

describe('SL-002 actor UI contract', () => {
  it('offers separate Exchange and Return choices with bounded line quantities', () => {
    assert.match(orderDetail, /Đổi\/Trả hàng/);
    assert.match(orderDetail, /Đổi hàng/);
    assert.match(orderDetail, /Trả hàng\/Hoàn tiền/);
    assert.match(orderDetail, /type="checkbox"/);
    assert.match(orderDetail, /type="number".*max=/s);
    assert.match(orderDetail, /Yêu cầu đang được xử lý, vui lòng chờ/);
  });

  it('contains no Exchange money, bank, payout, PayOS, or arbitrary SKU controls', () => {
    const combined = [orderDetail, customerDetail, staffDetail, warehouseInspection].join('\n');
    assert.doesNotMatch(combined, /refundAmount|Số tiền hoàn|bankAccount|Tài khoản ngân hàng|payOS|payout|priceDifference|shippingCharge/i);
    assert.doesNotMatch(combined, /replacementSku|SKU thay thế/i);
  });

  it('separates Staff eligibility from Warehouse inspection', () => {
    assert.match(staffDetail, /responsibility|Trách nhiệm/);
    assert.match(staffDetail, /Lý do quyết định/);
    assert.doesNotMatch(staffDetail, /acceptedSellableQuantity|acceptedDamagedQuantity/);
    assert.match(warehouseInspection, /acceptedSellableQuantity/);
    assert.match(warehouseInspection, /acceptedDamagedQuantity/);
    assert.match(warehouseInspection, /rejectedQuantity/);
    assert.match(warehouseInspection, /inspectionReason/);
    assert.match(warehouseInspection, /inspectionEvidence/);
  });

  it('shows Exchange status, payer, deadlines, inspection, and shipment facts to Customer', () => {
    assert.match(customerDetail, /shippingPayer|Bên chịu phí vận chuyển/);
    assert.match(customerDetail, /shipByAt|Hạn bàn giao/);
    assert.match(customerDetail, /inspection|Kết quả kiểm hàng/);
    assert.match(customerDetail, /shipments|Vận chuyển/);
    assert.match(customerDetail, /reportShipmentDispute|Khiếu nại thời điểm giao hàng/);
  });
});
