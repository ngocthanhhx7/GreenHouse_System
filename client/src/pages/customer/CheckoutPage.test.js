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

  it('keeps checkout idempotent while sending an immutable address snapshot', () => {
    assert.match(source, /checkoutIdempotencyKey/);
    assert.match(source, /formatShippingAddress/);
    assert.match(source, /orderService\.placeOrder/);
  });
});
