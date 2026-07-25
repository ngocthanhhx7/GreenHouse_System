import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const orderHistory = readFileSync(new URL('./customer/OrderHistoryPage.jsx', import.meta.url), 'utf8');
const orderDetail = readFileSync(new URL('./customer/OrderDetailPage.jsx', import.meta.url), 'utf8');
const staffDetail = readFileSync(new URL('./staff/StaffOrderDetailPage.jsx', import.meta.url), 'utf8');

describe('fulfillment flow UI contract', () => {
  it('uses one shared progress component on both Customer order surfaces', () => {
    assert.match(orderHistory, /OrderProgress/);
    assert.match(orderDetail, /OrderProgress/);
    assert.doesNotMatch(orderDetail, /order\.orderStatus === status/);
  });

  it('shows Staff the canonical Packed, Shipped and Delivered workflow', () => {
    assert.match(staffDetail, /OrderProgress/);
    assert.match(staffDetail, /order\.orderStatus === 'Confirmed'/);
    assert.match(staffDetail, /order\.stockExportRequest\?\.status === 'Completed'/);
    assert.match(staffDetail, /order\.orderStatus === 'Packed'/);
    assert.match(staffDetail, /order\.orderStatus === 'Shipped'/);
  });

  it('maps every packing checkbox to an exact checked quantity', () => {
    assert.match(staffDetail, /checked:\s*false/);
    assert.match(staffDetail, /checkedQuantity:\s*line\.checked\s*\?\s*line\.quantity\s*:\s*0/);
    assert.match(staffDetail, /checklist\.every\(\(line\) => line\.checked\)/);
  });

  it('requires evidence and a valid occurrence time before shipment commands', () => {
    assert.match(staffDetail, /validateHandoffDraft/);
    assert.match(staffDetail, /validateShipmentEventDraft/);
    assert.match(staffDetail, /evidenceReference/);
    assert.match(staffDetail, /occurredAt/);
  });

  it('hides the shipment event form after Delivered', () => {
    assert.match(staffDetail, /order\.orderStatus === 'Delivered'/);
    assert.match(staffDetail, /Đơn hàng đã giao thành công/);
  });
});
