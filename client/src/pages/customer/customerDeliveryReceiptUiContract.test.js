import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(new URL('./OrderDetailPage.jsx', import.meta.url), 'utf8');

describe('customer delivery receipt UI contract', () => {
  it('renders receipt choices only from the server action projection and preserves a one-flight command key', () => {
    assert.match(source, /availableDeliveryActions\.includes\('RECEIVED'\)/);
    assert.match(source, /availableDeliveryActions\.includes\('NOT_RECEIVED'\)/);
    assert.match(source, /deliveryReceiptSubmissionInFlight\s*=\s*useRef\(false\)/);
    assert.match(source, /deliveryReceiptIdempotencyKey\s*=\s*useRef/);
    assert.match(source, /recordDeliveryConfirmation\(id,/);
    assert.match(source, /await loadOrder\(\)/);
  });

  it('uses clear Vietnamese receipt controls and an accessible reason dialog', () => {
    assert.match(source, /'Đã nhận được hàng'/);
    assert.match(source, /'Chưa nhận được hàng'/);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /htmlFor="notReceivedReason"/);
    assert.match(source, /id="notReceivedReason"/);
    assert.match(source, /minLength=\{10\}/);
    assert.match(source, /maxLength=\{500\}/);
    assert.match(source, /Đang ghi nhận…/);
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
  });

  it('fails closed for after-sales unless both server receipt flags are true', () => {
    assert.match(source, /const afterSalesEnabled = order\.afterSales\?\.enabled === true\s*&&\s*order\.afterSales\?\.receiptGatePassed === true/);
    assert.match(source, /!activeCase && afterSalesEnabled/);
    assert.doesNotMatch(source, /!activeCase && order\.orderStatus === 'Delivered'/);
  });

  it('keeps disputed deliveries out of after-sales and communicates the next available receipt action', () => {
    assert.match(source, /customerOrderStatus === 'DeliveryDisputed'/);
    assert.match(source, /Bạn đã báo chưa nhận được hàng/);
  });

  it('announces receipt success politely and surfaces typed command errors as alerts', () => {
    assert.match(source, /\{message && <div className="alert alert-success" role="status" aria-live="polite">\{message\}<\/div>\}/);
    assert.match(source, /\{error && <div className="alert alert-danger" role="alert">\{error\}<\/div>\}/);
  });
});
