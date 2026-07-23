const ApiError = require('../utils/apiError');

const ACTIVE_AFTER_SALES_MESSAGE = 'This Order already has an active after-sales case';
const ACTIVE_AFTER_SALES_ERROR_CODE = 'AFTER_SALES_CASE_ACTIVE';
const ACTIVE_AFTER_SALES_ACTION_LABEL = 'Xem yêu cầu đang xử lý';

async function findLockedCase(repository, lock, session) {
  if (lock.caseType === 'EXCHANGE') {
    const finder = repository.findExchangeCaseById || repository.findCaseById;
    return finder ? finder.call(repository, lock.caseId, session) : null;
  }
  if (lock.caseType === 'RETURN_REFUND') {
    const finder = repository.findReturnRequestById || repository.findRequestById;
    return finder ? finder.call(repository, lock.caseId, session) : null;
  }
  return null;
}

async function resolveActiveAfterSalesConflict({
  repository,
  orderId,
  customerId,
  session,
}) {
  try {
    const lock = repository.findOrderLock
      ? await repository.findOrderLock(orderId, session)
      : null;
    const hasActiveLock = lock?.status === 'Active'
      && ['EXCHANGE', 'RETURN_REFUND'].includes(lock.caseType);
    if (!hasActiveLock) return { hasActiveLock: false, verified: false, data: null };

    const currentCase = await findLockedCase(repository, lock, session);
    const verified = Boolean(currentCase && String(currentCase.orderId) === String(orderId));
    const owned = verified && String(currentCase.customerId) === String(customerId);
    if (!owned) return { hasActiveLock: true, verified, data: null };

    const type = lock.caseType;
    const id = String(currentCase._id);
    return {
      hasActiveLock: true,
      verified: true,
      data: {
        currentCase: { type, id, status: String(currentCase.status || '') },
        action: {
          label: ACTIVE_AFTER_SALES_ACTION_LABEL,
          href: type === 'EXCHANGE' ? `/exchanges/${id}` : '/return-refunds',
        },
      },
    };
  } catch (_error) {
    return { hasActiveLock: false, verified: false, data: null };
  }
}

function createActiveAfterSalesConflict(data = null) {
  return new ApiError(
    409,
    ACTIVE_AFTER_SALES_MESSAGE,
    [],
    ACTIVE_AFTER_SALES_ERROR_CODE,
    data,
  );
}

module.exports = {
  ACTIVE_AFTER_SALES_MESSAGE,
  ACTIVE_AFTER_SALES_ERROR_CODE,
  ACTIVE_AFTER_SALES_ACTION_LABEL,
  resolveActiveAfterSalesConflict,
  createActiveAfterSalesConflict,
};
