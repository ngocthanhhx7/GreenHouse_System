const CANONICAL_CONFLICT_CODES = new Set([
  'DELIVERY_CONFIRMATION_ALREADY_RECORDED',
  'DELIVERY_RECEIPT_CONFLICT',
  'DELIVERY_DISPUTE_OPEN',
  'DELIVERY_EVENT_STALE',
]);

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function createDeliveryReceiptController({
  createKey,
  submitCommand,
  reloadCanonical,
  onReset = () => {},
  onSubmittingChange = () => {},
  onCanonicalOrder = () => {},
  onSuccess = () => {},
  onError = () => {},
}) {
  let mounted = true;
  let epoch = 0;
  let currentOrderId = '';
  let idempotencyKey = '';
  let activeToken = null;
  let ancillaryRefreshSequence = 0;

  function isCurrent(token) {
    return mounted
      && activeToken === token
      && token.epoch === epoch
      && token.orderId === currentOrderId;
  }

  function contextFor(token, extra = {}) {
    return {
      orderId: token.orderId,
      outcome: token.outcome,
      idempotencyKey: token.idempotencyKey,
      epoch: token.epoch,
      ...extra,
    };
  }

  return {
    mount() {
      mounted = true;
      ancillaryRefreshSequence += 1;
      return epoch;
    },

    setOrderId(orderId) {
      epoch += 1;
      ancillaryRefreshSequence += 1;
      currentOrderId = String(orderId || '');
      idempotencyKey = createKey(currentOrderId);
      activeToken = null;
      if (mounted) {
        onReset({ orderId: currentOrderId, epoch });
        onSubmittingChange(false, { orderId: currentOrderId, epoch });
      }
      return epoch;
    },

    isCurrentOrder(orderId, expectedEpoch = epoch) {
      return mounted
        && expectedEpoch === epoch
        && String(orderId || '') === currentOrderId;
    },

    getEpoch() {
      return epoch;
    },

    getIdempotencyKey() {
      return idempotencyKey;
    },

    beginAncillaryRefresh(orderId, expectedEpoch = epoch) {
      const normalizedOrderId = String(orderId || '');
      if (!mounted || expectedEpoch !== epoch || normalizedOrderId !== currentOrderId) {
        return null;
      }
      const token = {
        sequence: ++ancillaryRefreshSequence,
        orderId: normalizedOrderId,
        epoch: expectedEpoch,
      };
      return token;
    },

    isCurrentAncillaryRefresh(token) {
      return mounted
        && Boolean(token)
        && token.sequence === ancillaryRefreshSequence
        && token.epoch === epoch
        && token.orderId === currentOrderId;
    },

    async submit({
      outcome,
      expectedDeliveryEventId,
      reason = '',
    }) {
      if (!mounted || activeToken) return { skipped: true };
      const token = {
        epoch,
        orderId: currentOrderId,
        outcome,
        idempotencyKey,
      };
      activeToken = token;
      onSubmittingChange(true, contextFor(token));

      try {
        await submitCommand(token.orderId, {
          outcome: token.outcome,
          expectedDeliveryEventId,
          reason,
        }, token.idempotencyKey);
        if (!isCurrent(token)) return { stale: true };

        const canonicalOrder = await reloadCanonical(token.orderId);
        if (!isCurrent(token)) return { stale: true };

        onCanonicalOrder(canonicalOrder, contextFor(token, { source: 'success' }));
        idempotencyKey = createKey(currentOrderId);
        onSuccess(canonicalOrder, contextFor(token));
        return { success: true, order: canonicalOrder };
      } catch (error) {
        if (!isCurrent(token)) return { stale: true };
        if (CANONICAL_CONFLICT_CODES.has(error?.errorCode)) {
          try {
            const canonicalOrder = await reloadCanonical(token.orderId);
            if (!isCurrent(token)) return { stale: true };
            onCanonicalOrder(canonicalOrder, contextFor(token, { source: 'conflict' }));
          } catch {
            // The original typed error is still the actionable result. Keep the key for retry.
          }
        }
        if (isCurrent(token)) onError(error, contextFor(token));
        return { success: false, error };
      } finally {
        if (isCurrent(token)) {
          activeToken = null;
          onSubmittingChange(false, contextFor(token));
        }
      }
    },

    unmount() {
      mounted = false;
      epoch += 1;
      ancillaryRefreshSequence += 1;
      activeToken = null;
    },
  };
}

export async function loadOrderAncillary({
  orderId,
  isCurrent,
  getFulfillment,
  listExchanges,
  listReturns,
  onFulfillment = () => {},
  onExchanges = () => {},
  onReturns = () => {},
  onAfterSalesCases = () => {},
  onAfterSalesUnavailable = () => {},
  onComplete = () => {},
}) {
  const results = await Promise.allSettled([
    getFulfillment(orderId),
    listExchanges(),
    listReturns(),
  ]);
  if (!isCurrent()) return { stale: true };
  if (results[0].status === 'fulfilled') onFulfillment(results[0].value);
  const afterSalesCasesReady = results[1].status === 'fulfilled'
    && results[2].status === 'fulfilled';
  if (afterSalesCasesReady) {
    const exchanges = results[1].value;
    const returns = results[2].value;
    onExchanges(exchanges);
    onReturns(returns);
    onAfterSalesCases({ exchanges, returns });
    onComplete({
      status: 'ready',
      fulfillment: results[0].status === 'fulfilled' ? results[0].value : null,
      exchanges,
      returns,
    });
  } else {
    onAfterSalesUnavailable({
      exchangeError: results[1].status === 'rejected' ? results[1].reason : null,
      returnError: results[2].status === 'rejected' ? results[2].reason : null,
    });
  }
  return {
    stale: false,
    failures: results.filter((result) => result.status === 'rejected').map((result) => result.reason),
  };
}

export function shouldCloseDeliveryReceiptDialog(order, context) {
  return context?.source === 'conflict'
    && !order?.availableDeliveryActions?.includes(context.outcome);
}

export function focusFirstInDialog(dialog) {
  const focusable = [...(dialog?.querySelectorAll?.(FOCUSABLE_SELECTOR) || [])];
  focusable[0]?.focus?.();
}

export function restoreDialogTriggerFocus(trigger) {
  if (trigger?.isConnected) trigger.focus?.();
}

export function handleDeliveryDialogKeyDown(event, {
  isSubmitting,
  onEscape,
}) {
  if (event.key === 'Escape') {
    if (!isSubmitting) {
      event.preventDefault();
      onEscape();
    }
    return;
  }
  if (event.key !== 'Tab') return;

  const dialog = event.currentTarget;
  const focusable = [...(dialog?.querySelectorAll?.(FOCUSABLE_SELECTOR) || [])];
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  const activeElement = dialog.ownerDocument?.activeElement;
  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
