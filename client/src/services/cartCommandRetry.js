import { createCartIdempotencyKey } from './cartService.js';

function cloneFacts(facts) {
  return JSON.parse(JSON.stringify(facts));
}

export function createCartCommandRetryStore({
  createKey = createCartIdempotencyKey,
} = {}) {
  const pendingByOperation = new Map();

  return {
    acquire(operation, facts) {
      const normalizedOperation = String(operation);
      const clonedFacts = cloneFacts(facts);
      const fingerprint = JSON.stringify(clonedFacts);
      const existing = pendingByOperation.get(normalizedOperation);
      if (existing?.fingerprint === fingerprint) return existing.command;

      const command = {
        idempotencyKey: createKey(normalizedOperation),
        facts: clonedFacts,
      };
      pendingByOperation.set(normalizedOperation, { fingerprint, command });
      return command;
    },

    confirm(operation, command) {
      const current = pendingByOperation.get(String(operation));
      if (current?.command.idempotencyKey === command?.idempotencyKey) {
        pendingByOperation.delete(String(operation));
      }
    },
  };
}
