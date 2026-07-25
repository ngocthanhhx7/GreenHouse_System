function commandKey(requestId, kind, operationKey = '') {
  return `${requestId}:${kind}:${operationKey}`;
}

export function getRefundPayoutUiState(request, selectedMethod) {
  const payout = request?.payout || {};
  const status = payout.status || 'NotStarted';
  const canStart = ['NotStarted', 'Failed'].includes(status);
  const canReconcile = payout.canReconcileOperation === true;
  const readOnly = status === 'Succeeded' || request?.status === 'Completed';
  const canSelectMethod = canStart && !readOnly;

  return {
    showMethodSelector: canSelectMethod,
    showPayOS: canSelectMethod && selectedMethod === 'PayOS' && payout.canStartPayOS === true,
    showManual: canSelectMethod && selectedMethod === 'Manual' && payout.canRecordManualSuccess === true,
    showReconciliation: canReconcile && !readOnly,
    readOnly,
  };
}

export function createRefundPayoutController({
  createKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
} = {}) {
  let alive = true;
  let activeCommand = null;
  let loadEpoch = 0;
  const keys = new Map();

  function stableKey(requestId, kind, operationKey = '') {
    const identity = commandKey(requestId, kind, operationKey);
    if (!keys.has(identity)) keys.set(identity, createKey());
    return { identity, idempotencyKey: keys.get(identity) };
  }

  function begin(kind, requestId, payload = {}, operationKey = '') {
    if (!alive || activeCommand) return null;
    const { identity, idempotencyKey } = stableKey(requestId, kind, operationKey);
    const command = {
      kind,
      requestId,
      keyIdentity: identity,
      token: Symbol(kind),
      payload: { idempotencyKey, ...payload },
    };
    activeCommand = command;
    return command;
  }

  function settle(command, { succeeded = false } = {}) {
    if (!command || command !== activeCommand) return false;
    activeCommand = null;
    if (succeeded) keys.delete(command.keyIdentity);
    return alive;
  }

  return {
    beginLoad(requestId) {
      if (!alive) return null;
      loadEpoch += 1;
      return { requestId, epoch: loadEpoch };
    },
    isCurrentLoad(load) {
      return Boolean(alive && load && load.epoch === loadEpoch);
    },
    beginAction(requestId) {
      return begin('ACTION', requestId);
    },
    isCurrentCommand(command, requestId) {
      return Boolean(
        alive
        && command
        && command === activeCommand
        && command.requestId === requestId
      );
    },
    beginPayOS(requestId) {
      return begin('PAYOS', requestId);
    },
    beginManual(requestId, form = {}) {
      return begin('MANUAL', requestId, {
        method: 'MANUAL',
        status: 'Succeeded',
        providerReference: String(form.transferReference || '').trim(),
        occurredAt: form.transferredAt,
        reconciliationNote: String(form.note || '').trim(),
        confirmed: form.confirmed === true,
      });
    },
    beginReconciliation(requestId, operationKey, form = {}) {
      return begin('RECONCILIATION', requestId, {
        operationKey,
        outcome: form.outcome,
        providerReference: String(form.transferReference || '').trim(),
        occurredAt: form.transferredAt,
        reconciliationNote: String(form.note || '').trim(),
        confirmed: form.confirmed === true,
      }, operationKey);
    },
    getSnapshot() {
      return { alive, controlsDisabled: Boolean(activeCommand) };
    },
    settle,
    dispose() {
      alive = false;
      loadEpoch += 1;
      activeCommand = null;
      keys.clear();
    },
  };
}
