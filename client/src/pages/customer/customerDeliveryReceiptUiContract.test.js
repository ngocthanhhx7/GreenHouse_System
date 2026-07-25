import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(new URL('./OrderDetailPage.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

describe('customer delivery receipt UI contract', () => {
  it('renders receipt choices only from the server action projection and preserves a one-flight command key', () => {
    assert.match(source, /availableDeliveryActions\.includes\('RECEIVED'\)/);
    assert.match(source, /availableDeliveryActions\.includes\('NOT_RECEIVED'\)/);
    assert.match(source, /createDeliveryReceiptController/);
    assert.match(source, /deliveryReceiptController\.current\.submit/);
    assert.match(source, /recordDeliveryConfirmation\(orderId,/);
    assert.match(source, /await loadOrder\(\)/);
  });

  it('uses clear Vietnamese receipt controls and an accessible reason dialog', () => {
    assert.match(source, /'Đã nhận được hàng'/);
    assert.match(source, /'Chưa nhận được hàng'/);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /aria-describedby=\{error/);
    assert.match(source, /ref=\{deliveryReceiptDialogRef\}/);
    assert.match(source, /onKeyDown=\{handleReceiptDialogKeyDown\}/);
    assert.match(source, /inert=\{deliveryReceiptDialog \? true : undefined\}/);
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

  it('keeps the modal scrollable under mobile and browser zoom constraints', () => {
    assert.match(styles, /\.delivery-receipt-dialog-backdrop[\s\S]*overflow-y:\s*auto/);
    assert.match(styles, /\.delivery-receipt-dialog[\s\S]*max-height:\s*calc\(100(?:dvh|vh) - 32px\)/);
    assert.match(styles, /\.delivery-receipt-dialog[\s\S]*overflow-y:\s*auto/);
  });

  it('keeps validation and command errors visible inside the portal dialog', () => {
    assert.match(source, /id="deliveryReceiptDialogError"/);
    assert.match(source, /role="alert"/);
    assert.match(source, /aria-live="assertive"/);
    assert.match(source, /deliveryReceiptDialogDescription deliveryReceiptDialogError/);
    assert.match(source, /shouldCloseDeliveryReceiptDialog\(loadedOrder, context\)/);
    assert.match(source, /value=\{notReceivedReason\}/);
    assert.match(source, /onError: \(commandError\) => setError\(commandError\.message\)/);
  });

  it('fails closed while Exchange and Return case state is loading or unavailable', () => {
    assert.match(source, /afterSalesCasesStatus/);
    assert.match(source, /afterSalesCasesStatus === 'ready'/);
    assert.match(source, /Không thể xác minh trạng thái yêu cầu đổi\/trả/);
    assert.match(source, /onAfterSalesUnavailable/);
  });
});
