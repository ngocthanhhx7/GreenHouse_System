import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = await readFile(new URL('./CheckoutPage.jsx', import.meta.url), 'utf8');

describe('checkout address book contract', () => {
  it('loads saved addresses and selects the default address', () => {
    assert.match(source, /profileService\.listAddresses/);
    assert.match(source, /selectedAddressId/);
    assert.match(source, /isDefault/);
  });

  it('supports a structured one-time address and optional address book save', () => {
    assert.match(source, /newAddress/);
    assert.match(source, /saveAddress/);
    assert.match(source, /profileService\.createAddress/);
    assert.match(source, /addressLabel/);
    assert.match(source, /setSelectedAddressId\(savedAddress\.id\)/);
    assert.match(source, /setAddressMode\('saved'\)/);
    assert.match(source, /receiverName/);
    assert.match(source, /receiverPhone/);
  });

  it('keeps checkout idempotent while letting the server resolve a saved address snapshot', () => {
    assert.match(source, /checkoutIdempotencyKey/);
    assert.match(source, /savedAddressId:\s*deliveryAddress\.id/);
    assert.match(source, /deliveryAddress:\s*newAddress/);
    assert.match(source, /orderService\.placeOrder/);
  });

  it('renders backend checkout field errors beside their matching address controls and clears them on correction', () => {
    assert.match(source, /const \[fieldErrors, setFieldErrors\] = useState\(\{\}\)/);
    assert.match(source, /requestError\.errors/);
  assert.match(source, /const nextFieldErrors = toFieldErrors\(requestError\.errors(?:, requestError\.errorCode)?\)/);
    assert.match(source, /setFieldErrors\(nextFieldErrors\)/);
    assert.match(source, /entry\?\.field === 'savedAddressId'[\s\S]*?'addressSource'/);
    assert.match(source, /updateNewAddress[\s\S]*?clearFieldError\(field\)/);
    assert.match(source, /onChange=\{\(\) => \{ setSelectedAddressId\(address\.id\); clearFieldError\('addressSource'\); \}\}/);
    assert.match(source, /setAddressMode\('saved'\); clearFieldError\('addressSource'\)/);
    assert.match(source, /setAddressMode\('new'\); clearFieldError\('addressSource'\)/);
    assert.match(source, /fieldErrors\.receiverName/);
    assert.match(source, /fieldErrors\.phoneNumber/);
    assert.match(source, /fieldErrors\.province/);
    assert.match(source, /fieldErrors\.district/);
    assert.match(source, /fieldErrors\.ward/);
    assert.match(source, /fieldErrors\.addressLine/);
    assert.match(source, /role="alert"/);
  });

  it('clears the shared cart indicator only after a successful order is created', () => {
    assert.match(source, /useCart/);
    assert.match(source, /resetCart\(\);[\s\S]*?navigate\(`\/orders\/\$\{order\.id\}`/);
  });

  it('submits the exact displayed cart quantity, price, and price version', () => {
    assert.match(source, /expectedItems:\s*cart\.items\.map/);
    assert.match(source, /productId:\s*item\.productId/);
    assert.match(source, /quantity:\s*item\.quantity/);
    assert.match(source, /unitPrice:\s*item\.unitPrice/);
    assert.match(source, /priceVersion:\s*item\.priceVersion/);
  });

  it('shows price or cart drift as a distinct checkout warning', () => {
    assert.match(source, /startsWith\('expectedItems\.'/);
    assert.match(source, /fieldErrors\.checkoutPrice/);
    assert.match(source, /role="alert"/);
  });

  it('locks duplicate checkout clicks and shows stock conflicts separately', () => {
    assert.match(source, /CHECKOUT_STOCK_INSUFFICIENT/);
    assert.match(source, /checkoutStock/);
    assert.match(source, /submittingRef/);
    assert.match(source, /if \(submittingRef\.current\) return/);
    assert.match(source, /submittingRef\.current = true/);
  });

  it('keeps this checkout slice explicitly COD-only', () => {
    assert.match(source, /const paymentMethod = ['"]COD['"]/);
    assert.match(source, /paymentMethod,/);
    assert.doesNotMatch(source, /value=["']ONLINE["']/);
    assert.match(source, /Thanh toán khi nhận hàng/);
  });
});
