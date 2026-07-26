import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createRefundPayoutController,
  getRefundPayoutUiState,
} from './refundPayoutController.js';

describe('staff refund payout controller', () => {
  it('uses only the authoritative payout actions and keeps method forms isolated', () => {
    const start = getRefundPayoutUiState({
      payout: { status: 'NotStarted', canStartPayOS: true, canRecordManualSuccess: true },
      capabilities: { payOSConfigured: true },
    }, 'PayOS');
    assert.deepEqual(start, { showMethodSelector: true, showPayOS: true, showManual: false, showReconciliation: false, readOnly: false });

    const manual = getRefundPayoutUiState({
      payout: { status: 'Failed', canStartPayOS: true, canRecordManualSuccess: true },
      capabilities: { payOSConfigured: false },
    }, 'Manual');
    assert.deepEqual(manual, { showMethodSelector: true, showPayOS: false, showManual: true, showReconciliation: false, readOnly: false });
  });

  it('hides new payout actions for Processing and Unknown and exposes only exact-operation reconciliation', () => {
    for (const status of ['Processing', 'Unknown']) {
      const state = getRefundPayoutUiState({
        payout: { status, operationKey: 'operation-1', canStartPayOS: false, canRecordManualSuccess: false, canReconcileOperation: true },
        capabilities: { payOSConfigured: true },
      }, 'Manual');
      assert.deepEqual(state, { showMethodSelector: false, showPayOS: false, showManual: false, showReconciliation: true, readOnly: false });
    }
  });

  it('locks same-tick submissions, captures facts, and retains a retry key until canonical success', () => {
    let sequence = 0;
    const controller = createRefundPayoutController({ createKey: () => `key-${++sequence}` });
    const first = controller.beginManual('refund-1', {
      transferReference: 'MB-001', transferredAt: '2026-07-26T10:00', note: 'Đã kiểm tra giao dịch hoàn tiền hợp lệ.', confirmed: true,
    });
    assert.equal(controller.beginManual('refund-1', { transferReference: 'changed' }), null);
    assert.deepEqual(first.payload, {
      idempotencyKey: 'key-1', transferReference: 'MB-001', transferredAt: '2026-07-26T10:00', note: 'Đã kiểm tra giao dịch hoàn tiền hợp lệ.', confirmed: true,
    });
    assert.equal(controller.settle(first, { succeeded: false }), true);
    const retry = controller.beginManual('refund-1', { transferReference: 'MB-001', transferredAt: '2026-07-26T10:00', note: 'Đã kiểm tra giao dịch hoàn tiền hợp lệ.', confirmed: true });
    assert.equal(retry.payload.idempotencyKey, 'key-1');
    assert.equal(controller.settle(retry, { succeeded: true }), true);
    const afterSuccess = controller.beginManual('refund-1', { transferReference: 'MB-002', transferredAt: '2026-07-26T10:00', note: 'Đã kiểm tra giao dịch hoàn tiền hợp lệ.', confirmed: true });
    assert.equal(afterSuccess.payload.idempotencyKey, 'key-2');
  });

  it('keeps manual payout independent of PayOS and binds reconciliation to the current operation key', () => {
    const controller = createRefundPayoutController({ createKey: () => 'stable-key' });
    const manual = controller.beginManual('refund-1', { transferReference: 'BANK-1', transferredAt: '2026-07-26T10:00', note: 'Đã đối soát giao dịch chuyển khoản thủ công.', confirmed: true });
    assert.equal(manual.kind, 'MANUAL');
    assert.equal(manual.payload.transferReference, 'BANK-1');
    assert.equal(controller.settle(manual, { succeeded: false }), true);

    const reconciliation = controller.beginReconciliation('refund-1', 'operation-current', {
      outcome: 'Unknown', transferReference: 'BANK-1', transferredAt: '2026-07-26T10:00', note: 'Chưa đủ chứng từ để kết luận giao dịch.', confirmed: true,
    });
    assert.deepEqual(reconciliation.payload, {
      idempotencyKey: 'stable-key', operationKey: 'operation-current', outcome: 'Unknown', transferReference: 'BANK-1', transferredAt: '2026-07-26T10:00', note: 'Chưa đủ chứng từ để kết luận giao dịch.', confirmed: true,
    });
  });

  it('rejects stale route loads and ignores settlements after unmount', () => {
    const controller = createRefundPayoutController({ createKey: () => 'key' });
    const oldLoad = controller.beginLoad('refund-1');
    const currentLoad = controller.beginLoad('refund-2');
    assert.equal(controller.isCurrentLoad(oldLoad), false);
    assert.equal(controller.isCurrentLoad(currentLoad), true);
    const command = controller.beginPayOS('refund-2');
    controller.dispose();
    assert.equal(controller.isCurrentLoad(currentLoad), false);
    assert.equal(controller.settle(command, { succeeded: true }), false);
  });

  it('invalidates a deferred route-A command before route B can receive its feedback', async () => {
    const controllerA = createRefundPayoutController({ createKey: () => 'route-a-key' });
    const commandA = controllerA.beginPayOS('refund-a');
    let release;
    const deferred = new Promise((resolve) => { release = resolve; });
    const writes = [];
    const completion = (async () => {
      await deferred;
      if (controllerA.isCurrentCommand(commandA, 'refund-a')) writes.push('route-a-feedback');
    })();

    controllerA.dispose();
    const controllerB = createRefundPayoutController({ createKey: () => 'route-b-key' });
    const commandB = controllerB.beginPayOS('refund-b');
    release();
    await completion;

    assert.deepEqual(writes, []);
    assert.equal(controllerB.isCurrentCommand(commandB, 'refund-b'), true);
  });

  it('invalidates every deferred state write after unmount', async () => {
    const controller = createRefundPayoutController({ createKey: () => 'unmount-key' });
    const command = controller.beginAction('refund-1');
    let release;
    const deferred = new Promise((resolve) => { release = resolve; });
    const writes = [];
    const completion = (async () => {
      await deferred;
      if (controller.isCurrentCommand(command, 'refund-1')) writes.push('message');
      if (controller.isCurrentCommand(command, 'refund-1')) writes.push('busy');
    })();

    controller.dispose();
    release();
    await completion;

    assert.deepEqual(writes, []);
    assert.equal(controller.isCurrentCommand(command, 'refund-1'), false);
  });
});
