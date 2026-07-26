const ApiError = require('../utils/apiError');
const CustomerDeliveryReceipt = require('../models/customerDeliveryReceipt.model');

const CONFIRMATION_REQUIRED = 'AFTER_SALES_DELIVERY_CONFIRMATION_REQUIRED';
const DELIVERY_DISPUTED = 'AFTER_SALES_DELIVERY_DISPUTED';

function sameId(left, right) {
  return String(left || '') === String(right || '');
}

function typedConflict(errorCode, message) {
  return new ApiError(409, message, [], errorCode);
}

function createModelRepository() {
  return {
    async findLatestCustomerDeliveryReceiptByOrder(orderId, session) {
      const query = CustomerDeliveryReceipt.findOne({ orderId })
        .sort({ createdAt: -1, _id: -1 });
      return (session ? query.session(session) : query).lean();
    },
  };
}

function createCustomerDeliveryReceiptPolicy({ repository } = {}) {
  const fallbackRepository = createModelRepository();
  const receiptRepository = repository?.findLatestCustomerDeliveryReceiptByOrder
    ? repository
    : fallbackRepository;

  return {
    async requireReceived({
      order,
      customerId,
      deadlineField = null,
      session = null,
      receipt: suppliedReceipt,
    }) {
      const orderId = order?._id || order?.id;
      let receipt = suppliedReceipt;
      if (receipt === undefined && orderId) {
        receipt = await receiptRepository.findLatestCustomerDeliveryReceiptByOrder(
          orderId,
          session,
        );
      }
      receipt ||= null;
      const matchesBoundary = receipt
        && sameId(receipt.orderId, orderId)
        && sameId(receipt.customerId, customerId)
        && sameId(order?.customerId, customerId);

      if (!matchesBoundary) {
        throw typedConflict(
          CONFIRMATION_REQUIRED,
          'Customer delivery confirmation is required before after-sales actions',
        );
      }
      if (receipt.outcome === 'NOT_RECEIVED') {
        throw typedConflict(
          DELIVERY_DISPUTED,
          'Customer reported that the delivery was not received',
        );
      }
      if (receipt.outcome !== 'RECEIVED') {
        throw typedConflict(
          CONFIRMATION_REQUIRED,
          'Customer delivery confirmation is required before after-sales actions',
        );
      }

      let deadlineAt = null;
      if (deadlineField) {
        deadlineAt = new Date(receipt[deadlineField]);
        if (!receipt[deadlineField] || Number.isNaN(deadlineAt.getTime())) {
          throw typedConflict(
            CONFIRMATION_REQUIRED,
            'Customer delivery confirmation has no valid after-sales deadline',
          );
        }
      }

      return { receipt, deadlineAt };
    },
  };
}

module.exports = {
  CONFIRMATION_REQUIRED,
  DELIVERY_DISPUTED,
  createCustomerDeliveryReceiptPolicy,
};
