function wipeCommand(command) {
  if (!command?.payload) return;
  command.payload.accountNumber = '';
  command.payload.accountHolderName = '';
  command.payload.confirmed = false;
}

export function createRefundDestinationController({
  createKey = () => globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
} = {}) {
  let alive = true;
  let activeCommand = null;
  let bankEpoch = 0;
  let requestEpoch = 0;
  let bankState = {
    bankStatus: 'loading',
    bankError: '',
    banks: [],
  };
  const destinationKeys = new Map();

  function getSnapshot() {
    return {
      alive,
      controlsDisabled: Boolean(activeCommand),
      ...bankState,
    };
  }

  function beginBankLoad() {
    if (!alive) return null;
    bankEpoch += 1;
    bankState = { bankStatus: 'loading', bankError: '', banks: [] };
    return bankEpoch;
  }

  function resolveBankLoad(epoch, banks) {
    if (!alive || epoch !== bankEpoch) return false;
    const safeBanks = Array.isArray(banks)
      ? banks.map((bank) => ({ code: bank.code, name: bank.name }))
      : [];
    bankState = {
      bankStatus: safeBanks.length ? 'ready' : 'empty',
      bankError: '',
      banks: safeBanks,
    };
    return true;
  }

  function rejectBankLoad(epoch, error) {
    if (!alive || epoch !== bankEpoch) return false;
    bankState = {
      bankStatus: 'error',
      bankError: String(error?.message || 'Không thể tải danh sách ngân hàng'),
      banks: [],
    };
    return true;
  }

  function beginRequestLoad() {
    if (!alive) return null;
    requestEpoch += 1;
    return requestEpoch;
  }

  function isCurrentRequestLoad(epoch) {
    return alive && epoch !== null && epoch === requestEpoch;
  }

  function beginAction(id, kind = 'ACTION') {
    if (!alive || activeCommand) return null;
    const command = { id, kind, token: Symbol(kind), payload: null };
    activeCommand = command;
    return command;
  }

  function beginDestination(id, form = {}) {
    const command = beginAction(id, 'DESTINATION');
    if (!command) return null;
    let idempotencyKey = destinationKeys.get(id);
    if (!idempotencyKey) {
      idempotencyKey = createKey();
      destinationKeys.set(id, idempotencyKey);
    }
    command.payload = {
      bankCode: form.bankCode,
      accountNumber: form.accountNumber,
      accountHolderName: form.accountHolderName,
      confirmed: form.confirmed === true,
      idempotencyKey,
    };
    return command;
  }

  function settleAction(command) {
    if (!command || command !== activeCommand) return false;
    activeCommand = null;
    return alive;
  }

  function settleDestination(command, { succeeded = false, onSuccessClear } = {}) {
    if (!command || command !== activeCommand || command.kind !== 'DESTINATION') {
      wipeCommand(command);
      return false;
    }
    if (succeeded) destinationKeys.delete(command.id);
    activeCommand = null;
    wipeCommand(command);
    if (succeeded && alive && typeof onSuccessClear === 'function') onSuccessClear();
    return alive;
  }

  function dispose() {
    alive = false;
    bankEpoch += 1;
    requestEpoch += 1;
    wipeCommand(activeCommand);
    activeCommand = null;
    destinationKeys.clear();
    bankState = { bankStatus: 'loading', bankError: '', banks: [] };
  }

  return {
    beginAction,
    beginBankLoad,
    beginDestination,
    beginRequestLoad,
    dispose,
    getSnapshot,
    isCurrentRequestLoad,
    rejectBankLoad,
    resolveBankLoad,
    settleAction,
    settleDestination,
  };
}
