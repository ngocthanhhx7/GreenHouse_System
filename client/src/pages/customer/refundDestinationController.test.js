import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRefundDestinationController } from './refundDestinationController.js';

describe('refund destination page controller', () => {
  it('locks same-tick duplicates and preserves captured facts with one stable retry identity', () => {
    let sequence = 0;
    const controller = createRefundDestinationController({
      createKey: () => `key-${++sequence}`,
    });
    const form = {
      bankCode: 'MB',
      accountNumber: '0123456789',
      accountHolderName: 'Nguyen Van A',
      confirmed: true,
    };

    const first = controller.beginDestination('refund-1', form);
    form.accountNumber = '9999999999';
    assert.equal(controller.getSnapshot().controlsDisabled, true);
    assert.equal(controller.beginDestination('refund-1', form), null);
    assert.deepEqual(first.payload, {
      bankCode: 'MB',
      accountNumber: '0123456789',
      accountHolderName: 'Nguyen Van A',
      confirmed: true,
      idempotencyKey: 'key-1',
    });

    let cleared = 0;
    assert.equal(controller.settleDestination(first, {
      succeeded: false,
      onSuccessClear: () => { cleared += 1; },
    }), true);
    assert.equal(cleared, 0);
    assert.equal(first.payload.accountNumber, '');
    assert.equal(form.accountNumber, '9999999999');
    const retry = controller.beginDestination('refund-1', form);
    assert.equal(retry.payload.idempotencyKey, 'key-1');
    assert.equal(controller.settleDestination(retry, {
      succeeded: true,
      onSuccessClear: () => { cleared += 1; },
    }), true);
    assert.equal(cleared, 1);
    assert.equal(retry.payload.accountHolderName, '');

    const afterSuccess = controller.beginDestination('refund-1', form);
    assert.equal(afterSuccess.payload.idempotencyKey, 'key-2');
  });

  it('models bank loading, empty, error and retry while ignoring stale resolutions', () => {
    const controller = createRefundDestinationController({ createKey: () => 'unused-key' });
    const first = controller.beginBankLoad();
    assert.equal(controller.getSnapshot().bankStatus, 'loading');
    assert.equal(controller.rejectBankLoad(first, new Error('offline')), true);
    assert.deepEqual(controller.getSnapshot(), {
      alive: true,
      controlsDisabled: false,
      bankStatus: 'error',
      bankError: 'offline',
      banks: [],
    });

    const stale = controller.beginBankLoad();
    const retry = controller.beginBankLoad();
    assert.equal(controller.resolveBankLoad(stale, [{ code: 'VCB', name: 'Vietcombank' }]), false);
    assert.equal(controller.resolveBankLoad(retry, []), true);
    assert.equal(controller.getSnapshot().bankStatus, 'empty');

    const ready = controller.beginBankLoad();
    assert.equal(controller.resolveBankLoad(ready, [{ code: 'MB', name: 'MBBank' }]), true);
    assert.equal(controller.getSnapshot().bankStatus, 'ready');
    assert.deepEqual(controller.getSnapshot().banks, [{ code: 'MB', name: 'MBBank' }]);
  });

  it('invalidates loads/actions and wipes sensitive command closures on route unmount', () => {
    const controller = createRefundDestinationController({ createKey: () => 'stable-key' });
    const load = controller.beginRequestLoad();
    const command = controller.beginDestination('refund-1', {
      bankCode: 'MB',
      accountNumber: '0123456789',
      accountHolderName: 'Nguyen Van A',
      confirmed: true,
    });

    controller.dispose();
    assert.equal(command.payload.accountNumber, '');
    assert.equal(command.payload.accountHolderName, '');
    assert.equal(controller.isCurrentRequestLoad(load), false);
    assert.equal(controller.settleDestination(command, { succeeded: true }), false);
    assert.equal(controller.getSnapshot().alive, false);
  });
});
