const EMPTY_CART = Object.freeze({ items: [], totalAmount: 0 });

function normalizeCart(cart) {
  return {
    ...EMPTY_CART,
    ...(cart || {}),
    items: Array.isArray(cart?.items) ? cart.items : [],
  };
}

export function createCartRequestCoordinator({ onCommit }) {
  if (typeof onCommit !== 'function') throw new TypeError('onCommit must be a function');

  let identity = null;
  let generation = 0;
  let queue = Promise.resolve();

  function invalidate() {
    generation += 1;
    queue = Promise.resolve();
    onCommit({ ...EMPTY_CART });
  }

  return {
    switchIdentity(nextIdentity) {
      const normalizedIdentity = nextIdentity == null ? null : String(nextIdentity);
      if (normalizedIdentity === identity) return false;
      identity = normalizedIdentity;
      invalidate();
      return true;
    },

    reset() {
      invalidate();
    },

    async run(operation) {
      const requestGeneration = generation;
      const predecessor = queue;
      const execution = predecessor.catch(() => {}).then(async () => {
        if (requestGeneration !== generation) {
          return { data: undefined, committed: false, skipped: true };
        }

        const data = await operation();
        const committed = requestGeneration === generation;
        if (committed) onCommit(normalizeCart(data));
        return { data, committed, skipped: false };
      });

      queue = execution.catch(() => {});
      return execution;
    },
  };
}
