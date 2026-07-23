import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';

const moduleUrl = new URL('./cartRequestCoordinator.js', import.meta.url);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function loadCoordinator() {
  assert.equal(existsSync(moduleUrl), true, 'cart request coordinator must guard asynchronous cart state');
  const module = await import(moduleUrl);
  return module.createCartRequestCoordinator;
}

describe('cart request coordinator', () => {
  it('ignores a Customer A load that resolves after logout or switching to Customer B', async () => {
    const createCoordinator = await loadCoordinator();
    const commits = [];
    const coordinator = createCoordinator({ onCommit: (cart) => commits.push(cart) });
    const customerALoad = deferred();

    coordinator.switchIdentity('customer-a');
    const pending = coordinator.run(() => customerALoad.promise);
    coordinator.switchIdentity('customer-b');
    customerALoad.resolve({ items: [{ id: 'old-a', quantity: 1 }] });

    const result = await pending;
    assert.equal(result.committed, false);
    assert.deepEqual(commits.at(-1), { items: [], totalAmount: 0 });
  });

  it('ignores a Customer request that resolves after explicit logout', async () => {
    const createCoordinator = await loadCoordinator();
    const commits = [];
    const coordinator = createCoordinator({ onCommit: (cart) => commits.push(cart) });
    const customerLoad = deferred();

    coordinator.switchIdentity('customer-a');
    const pending = coordinator.run(() => customerLoad.promise);
    coordinator.switchIdentity(null);
    customerLoad.resolve({ items: [{ id: 'logged-out-cart', quantity: 1 }] });

    const result = await pending;
    assert.equal(result.committed, false);
    assert.deepEqual(commits.at(-1), { items: [], totalAmount: 0 });
  });

  it('ignores a stale load or mutation that resolves after checkout resets the cart', async () => {
    const createCoordinator = await loadCoordinator();
    const commits = [];
    const coordinator = createCoordinator({ onCommit: (cart) => commits.push(cart) });
    const staleMutation = deferred();

    coordinator.switchIdentity('customer-a');
    const pending = coordinator.run(() => staleMutation.promise);
    coordinator.reset();
    staleMutation.resolve({ items: [{ id: 'already-ordered', quantity: 2 }] });

    const result = await pending;
    assert.equal(result.committed, false);
    assert.deepEqual(commits.at(-1), { items: [], totalAmount: 0 });
  });

  it('serializes quantity mutations in initiation order and commits the final user action', async () => {
    const createCoordinator = await loadCoordinator();
    const commits = [];
    const coordinator = createCoordinator({ onCommit: (cart) => commits.push(cart) });
    const quantityTwo = deferred();
    const quantityThree = deferred();
    let quantityThreeCalls = 0;

    coordinator.switchIdentity('customer-a');
    const first = coordinator.run(() => quantityTwo.promise);
    const second = coordinator.run(() => {
      quantityThreeCalls += 1;
      return quantityThree.promise;
    });
    await Promise.resolve();
    assert.equal(quantityThreeCalls, 0);

    quantityTwo.resolve({ items: [{ id: 'line-1', quantity: 2 }], totalAmount: 200 });
    const firstResult = await first;
    assert.equal(firstResult.committed, true);
    await Promise.resolve();
    assert.equal(quantityThreeCalls, 1);

    quantityThree.resolve({ items: [{ id: 'line-1', quantity: 3 }], totalAmount: 300 });
    const secondResult = await second;
    assert.equal(secondResult.committed, true);
    assert.deepEqual(commits.at(-1), { items: [{ id: 'line-1', quantity: 3 }], totalAmount: 300 });
  });

  it('keeps the last successful cart when a later queued mutation rejects', async () => {
    const createCoordinator = await loadCoordinator();
    const commits = [];
    const coordinator = createCoordinator({ onCommit: (cart) => commits.push(cart) });
    const firstMutation = deferred();
    let rejectingMutationCalls = 0;

    coordinator.switchIdentity('customer-a');
    const first = coordinator.run(() => firstMutation.promise);
    const second = coordinator.run(() => {
      rejectingMutationCalls += 1;
      return Promise.reject(new Error('stock changed'));
    });
    await Promise.resolve();
    assert.equal(rejectingMutationCalls, 0);

    const successfulCart = { items: [{ id: 'line-1', quantity: 2 }], totalAmount: 200 };
    firstMutation.resolve(successfulCart);
    await first;
    await assert.rejects(second, /stock changed/);

    assert.equal(rejectingMutationCalls, 1);
    assert.deepEqual(commits.at(-1), successfulCart);
  });

  it('replaces the queue on identity change and skips queued old-generation API calls', async () => {
    const createCoordinator = await loadCoordinator();
    const commits = [];
    const coordinator = createCoordinator({ onCommit: (cart) => commits.push(cart) });
    const oldInFlight = deferred();
    const oldInFlightStarted = deferred();
    let oldInFlightCalls = 0;
    let queuedOldCalls = 0;

    coordinator.switchIdentity('customer-a');
    const firstOld = coordinator.run(() => {
      oldInFlightCalls += 1;
      oldInFlightStarted.resolve();
      return oldInFlight.promise;
    });
    await oldInFlightStarted.promise;
    assert.equal(oldInFlightCalls, 1);
    const queuedOld = coordinator.run(() => {
      queuedOldCalls += 1;
      return Promise.resolve({ items: [{ id: 'must-not-call', quantity: 1 }] });
    });

    coordinator.switchIdentity('customer-b');
    const customerBCart = { items: [{ id: 'customer-b', quantity: 1 }], totalAmount: 500 };
    const customerB = await coordinator.run(() => Promise.resolve(customerBCart));
    assert.equal(customerB.committed, true);
    assert.equal(queuedOldCalls, 0);

    oldInFlight.resolve({ items: [{ id: 'customer-a', quantity: 1 }], totalAmount: 100 });
    assert.equal((await firstOld).committed, false);
    const skipped = await queuedOld;
    assert.equal(skipped.skipped, true);
    assert.equal(queuedOldCalls, 0);
    assert.deepEqual(commits.at(-1), customerBCart);
  });
});
