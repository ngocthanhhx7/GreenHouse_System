import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const contextPath = new URL('./CartContext.jsx', import.meta.url);

describe('cart context contract', () => {
  it('provides customer cart state and resets it outside the Customer role', () => {
    assert.equal(existsSync(contextPath), true, 'CartContext must exist so Header can share cart state with cart mutations');

    const source = readFileSync(contextPath, 'utf8');
    assert.match(source, /export function CartProvider/);
    assert.match(source, /export function useCart/);
    assert.match(source, /itemCount/);
    assert.match(source, /hasItems/);
    assert.match(source, /user\?\.role !== 'Customer'/);
    assert.match(source, /user\?\.id/);
  });

  it('exposes refresh and reset actions for every cart mutation and checkout completion', () => {
    const source = readFileSync(contextPath, 'utf8');

    assert.match(source, /refreshCart/);
    assert.match(source, /resetCart/);
    assert.match(source, /runCartMutation/);
    assert.match(source, /createCartRequestCoordinator/);
    assert.doesNotMatch(source, /syncCart/);
    assert.match(source, /cartService\.getCart/);
  });
});
