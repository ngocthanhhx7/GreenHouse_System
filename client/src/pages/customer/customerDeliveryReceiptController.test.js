import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDeliveryReceiptController,
  focusFirstInDialog,
  handleDeliveryDialogKeyDown,
  loadOrderAncillary,
  restoreDialogTriggerFocus,
} from './customerDeliveryReceiptController.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('customer delivery receipt controller', () => {
  it('locks duplicate same-tick submits and uses the captured order, outcome, and key', async () => {
    const request = deferred();
    const calls = [];
    const canonical = [];
    const controller = createDeliveryReceiptController({
      createKey: (orderId) => `key:${orderId}`,
      submitCommand: (orderId, payload, key) => {
        calls.push({ orderId, payload, key });
        return request.promise;
      },
      reloadCanonical: async (orderId) => ({ id: orderId, customerOrderStatus: 'Completed' }),
      onCanonicalOrder: (order, context) => canonical.push({ order, context }),
    });
    controller.setOrderId('order-a');

    const first = controller.submit({
      outcome: 'RECEIVED',
      expectedDeliveryEventId: 'event-a',
      reason: '',
    });
    const duplicate = await controller.submit({
      outcome: 'NOT_RECEIVED',
      expectedDeliveryEventId: 'event-a',
      reason: 'must not run',
    });

    assert.deepEqual(duplicate, { skipped: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      orderId: 'order-a',
      payload: {
        outcome: 'RECEIVED',
        expectedDeliveryEventId: 'event-a',
        reason: '',
      },
      key: 'key:order-a',
    });
    request.resolve({});
    await first;
    assert.equal(canonical.length, 1);
  });

  it('ignores route A stale response and finally without unlocking or overwriting route B', async () => {
    const requestA = deferred();
    const requestB = deferred();
    const submitting = [];
    const canonical = [];
    const controller = createDeliveryReceiptController({
      createKey: (orderId) => `key:${orderId}`,
      submitCommand: (orderId) => (orderId === 'order-a' ? requestA.promise : requestB.promise),
      reloadCanonical: async (orderId) => ({ id: orderId }),
      onSubmittingChange: (value, context) => submitting.push({ value, orderId: context.orderId }),
      onCanonicalOrder: (order) => canonical.push(order.id),
    });
    controller.setOrderId('order-a');
    const submitA = controller.submit({ outcome: 'RECEIVED', expectedDeliveryEventId: 'event-a' });
    controller.setOrderId('order-b');
    const submitB = controller.submit({ outcome: 'RECEIVED', expectedDeliveryEventId: 'event-b' });

    requestA.resolve({});
    await submitA;
    assert.deepEqual(canonical, []);
    assert.equal(submitting.at(-1).value, true);
    assert.equal(submitting.at(-1).orderId, 'order-b');

    requestB.resolve({});
    await submitB;
    assert.deepEqual(canonical, ['order-b']);
    assert.deepEqual(submitting.at(-1), { value: false, orderId: 'order-b' });
  });

  it('does not publish state after unmount', async () => {
    const request = deferred();
    const events = [];
    const controller = createDeliveryReceiptController({
      createKey: () => 'key',
      submitCommand: () => request.promise,
      reloadCanonical: async () => ({ id: 'order-a' }),
      onCanonicalOrder: () => events.push('canonical'),
      onError: () => events.push('error'),
      onSubmittingChange: (value) => events.push(`submitting:${value}`),
    });
    controller.setOrderId('order-a');
    const pending = controller.submit({ outcome: 'RECEIVED', expectedDeliveryEventId: 'event-a' });
    const eventsBeforeUnmount = [...events];
    controller.unmount();
    request.resolve({});
    await pending;
    assert.deepEqual(events, eventsBeforeUnmount);
  });

  it('reloads canonical order for every typed conflict while retaining the command key', async () => {
    const conflictCodes = [
      'DELIVERY_CONFIRMATION_ALREADY_RECORDED',
      'DELIVERY_RECEIPT_CONFLICT',
      'DELIVERY_DISPUTE_OPEN',
      'DELIVERY_EVENT_STALE',
    ];

    for (const errorCode of conflictCodes) {
      const canonical = [];
      const errors = [];
      const controller = createDeliveryReceiptController({
        createKey: () => `stable-key:${errorCode}`,
        submitCommand: async () => {
          const error = new Error('delivery confirmation conflict');
          error.errorCode = errorCode;
          throw error;
        },
        reloadCanonical: async (orderId) => ({ id: orderId, customerOrderStatus: 'Completed' }),
        onCanonicalOrder: (order, context) => canonical.push({ order, context }),
        onError: (error) => errors.push(error.errorCode),
      });
      controller.setOrderId('order-a');

      await controller.submit({ outcome: 'RECEIVED', expectedDeliveryEventId: 'event-a' });

      assert.equal(controller.getIdempotencyKey(), `stable-key:${errorCode}`);
      assert.equal(canonical[0].context.source, 'conflict');
      assert.deepEqual(errors, [errorCode]);
    }
  });

  it('retains key and input responsibility on ambiguous network failure', async () => {
    const canonical = [];
    const controller = createDeliveryReceiptController({
      createKey: () => 'ambiguous-key',
      submitCommand: async () => { throw new TypeError('Failed to fetch'); },
      reloadCanonical: async () => {
        canonical.push('reload');
        return {};
      },
    });
    controller.setOrderId('order-a');
    await controller.submit({
      outcome: 'NOT_RECEIVED',
      expectedDeliveryEventId: 'event-a',
      reason: 'Tôi chưa nhận được kiện hàng.',
    });
    assert.equal(controller.getIdempotencyKey(), 'ambiguous-key');
    assert.deepEqual(canonical, []);
  });

  it('commits canonical success before ancillary requests settle and tolerates ancillary failure', async () => {
    const fulfillment = deferred();
    const events = [];
    const ancillaryPromise = loadOrderAncillary({
      orderId: 'order-a',
      isCurrent: () => true,
      getFulfillment: () => fulfillment.promise,
      listExchanges: async () => { throw new Error('exchange unavailable'); },
      listReturns: async () => ({ items: [] }),
      onFulfillment: () => events.push('fulfillment'),
      onExchanges: () => events.push('exchange'),
      onReturns: () => events.push('return'),
    });
    events.push('canonical');
    await flush();
    assert.deepEqual(events, ['canonical']);
    fulfillment.resolve({ cycles: [] });
    await ancillaryPromise;
    assert.deepEqual(events, ['canonical', 'fulfillment', 'return']);
  });
});

describe('delivery receipt dialog keyboard contract', () => {
  function focusFixture() {
    const ownerDocument = { activeElement: null };
    const first = { focus: () => { ownerDocument.activeElement = first; } };
    const last = { focus: () => { ownerDocument.activeElement = last; } };
    const dialog = {
      ownerDocument,
      querySelectorAll: () => [first, last],
    };
    return { dialog, ownerDocument, first, last };
  }

  it('moves focus into the dialog and traps Tab in both directions', () => {
    const { dialog, ownerDocument, first, last } = focusFixture();
    focusFirstInDialog(dialog);
    assert.equal(ownerDocument.activeElement, first);

    ownerDocument.activeElement = last;
    let prevented = false;
    handleDeliveryDialogKeyDown({
      key: 'Tab',
      shiftKey: false,
      currentTarget: dialog,
      preventDefault: () => { prevented = true; },
    }, { isSubmitting: false, onEscape: () => {} });
    assert.equal(prevented, true);
    assert.equal(ownerDocument.activeElement, first);

    ownerDocument.activeElement = first;
    handleDeliveryDialogKeyDown({
      key: 'Tab',
      shiftKey: true,
      currentTarget: dialog,
      preventDefault: () => {},
    }, { isSubmitting: false, onEscape: () => {} });
    assert.equal(ownerDocument.activeElement, last);
  });

  it('closes on Escape only while idle', () => {
    const { dialog } = focusFixture();
    let closes = 0;
    let prevented = 0;
    const event = {
      key: 'Escape',
      currentTarget: dialog,
      preventDefault: () => { prevented += 1; },
    };
    handleDeliveryDialogKeyDown(event, { isSubmitting: true, onEscape: () => { closes += 1; } });
    handleDeliveryDialogKeyDown(event, { isSubmitting: false, onEscape: () => { closes += 1; } });
    assert.equal(closes, 1);
    assert.equal(prevented, 1);
  });

  it('restores focus only to a trigger that is still connected', () => {
    let connectedFocuses = 0;
    let detachedFocuses = 0;
    restoreDialogTriggerFocus({
      isConnected: true,
      focus: () => { connectedFocuses += 1; },
    });
    restoreDialogTriggerFocus({
      isConnected: false,
      focus: () => { detachedFocuses += 1; },
    });
    assert.equal(connectedFocuses, 1);
    assert.equal(detachedFocuses, 0);
  });
});
