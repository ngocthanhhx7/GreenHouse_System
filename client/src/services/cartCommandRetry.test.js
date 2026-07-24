import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCartCommandRetryStore } from './cartCommandRetry.js';

describe('cart command retry store', () => {
  it('reuses the original key and exact facts after an ambiguous failure', () => {
    let keyNumber = 0;
    const store = createCartCommandRetryStore({
      createKey: () => `cart-command-${++keyNumber}`,
    });
    const facts = { productId: 'product-1', quantity: 1, expectedVersion: 4 };

    const first = store.acquire('add:product-1', facts);
    const retry = store.acquire('add:product-1', facts);

    assert.deepEqual(retry, first);
    assert.equal(keyNumber, 1);
  });

  it('rotates only after a confirmed result or explicit changed command facts', () => {
    let keyNumber = 0;
    const store = createCartCommandRetryStore({
      createKey: () => `cart-command-${++keyNumber}`,
    });
    const first = store.acquire('update:line-1', { quantity: 2, expectedVersion: 4 });

    const changed = store.acquire('update:line-1', { quantity: 3, expectedVersion: 4 });
    assert.notEqual(changed.idempotencyKey, first.idempotencyKey);

    store.confirm('update:line-1', changed);
    const next = store.acquire('update:line-1', { quantity: 3, expectedVersion: 5 });
    assert.notEqual(next.idempotencyKey, changed.idempotencyKey);
  });
});
