const IDENTITY_TYPES = new Set([
  'ACCOUNT_REGISTRATION_COMPLETED',
  'INTERNAL_INVITATION_CREATED',
  'INTERNAL_INVITATION_ACCEPTED',
  'PASSWORD_RESET_COMPLETED',
  'PROFILE_PASSWORD_CHANGED',
  'ACCOUNT_DISABLED',
  'ACCOUNT_REACTIVATED',
]);

const CUSTOMER_TYPES = new Set([
  'ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_SHIPPED', 'ORDER_DELIVERED',
  'ORDER_COMPLETED_BY_CUSTOMER', 'CUSTOMER_DELIVERY_DISPUTED',
  'ORDER_CANCELLED', 'ORDER_RETURNED', 'ORDER_PAYMENT_EXPIRED',
  'DELIVERY_ATTEMPT_FAILED', 'DELIVERY_RESCHEDULED', 'DELIVERY_FAILED',
  'PAYMENT_STATUS', 'PAYMENT_RECONCILED', 'REFUND_PENDING', 'REFUND_COMPLETED',
  'RETURN_REFUND', 'RETURN_REFUND_APPROVED', 'RETURN_REFUND_REJECTED',
  'RETURN_REFUND_EXPIRED', 'RETURN_REFUND_RECEIVED', 'RETURN_REFUND_COMPLETED',
  'REFUND_DESTINATION_VERIFIED', 'REFUND_DESTINATION_REJECTED',
  'REFUND_PAYOUT_INCIDENT_OPENED', 'EXCHANGE_APPROVED', 'EXCHANGE_REJECTED',
  'EXCHANGE_RECEIVED', 'EXCHANGE_COMPLETED', 'REVIEW_MODERATION_CHANGED',
  'REVIEW_ALLOWED', 'REVIEW_HIDDEN', 'SUPPORT_MESSAGE_APPENDED',
  'SUPPORT_RESOLVED', 'SUPPORT_RESPONSE_VISIBLE',
  'SUPPORT_STATUS',
]);

const INTERNAL_ROLES = Object.freeze({
  SUPPORT_CLAIMED: 'Staff',
  SUPPORT_TRANSFERRED: 'Staff',
  ASSIGNEE_CLEARED: 'Staff',
  INVENTORY_ADJUSTED: 'WarehouseManager',
  INVENTORY_EXPORT: 'WarehouseManager',
  LOW_STOCK_OPENED: 'WarehouseManager',
  STOCK_EXPORT: 'WarehouseManager',
  STOCK_EXPORT_APPROVED: 'Staff',
  STOCK_EXPORT_REJECTED: 'Staff',
  DAMAGE_REPORTED: 'WarehouseManager',
  DAMAGE_DECIDED: 'Staff',
  REPLENISHMENT_REQUESTED: 'Admin',
  REPLENISHMENT_APPROVED: 'WarehouseManager',
  REPLENISHMENT_REJECTED: 'WarehouseManager',
  REPLENISHMENT_RECEIVED: 'WarehouseManager',
  INSPECTION_ASSIGNED: 'WarehouseManager',
  INSPECTION_COMPLETED: 'WarehouseManager',
  REFUND_PAYOUT_OPERATION_RECONCILED: 'Staff',
});

const PACKED_TYPES = new Set(['PACKED', 'ORDER_PACKED']);
const DIRECT_CUSTOMER_TYPES = new Set([
  'ORDER_COMPLETED_BY_CUSTOMER',
  'CUSTOMER_DELIVERY_DISPUTED',
]);

function assertNotificationRecipientSelector(typeValue, recipientSelector = {}) {
  const type = String(typeValue || '').trim().toUpperCase();
  if (!DIRECT_CUSTOMER_TYPES.has(type) || !recipientSelector.recipientRole) return;
  const error = new Error('Notification event requires a direct recipient');
  error.code = 'NOTIFICATION_DIRECT_RECIPIENT_REQUIRED';
  throw error;
}

function resolveNotificationChannels(typeValue, recipient = {}) {
  const requestedType = String(typeValue || '').trim().toUpperCase();
  const type = requestedType === 'ORDER_CREATED' ? 'ORDER_RECEIVED' : requestedType;
  if (PACKED_TYPES.has(type)) return [];
  if (IDENTITY_TYPES.has(type)) {
    return recipient.userId && recipient.hasAccessibleAccount !== false
      ? ['Email', 'InApp']
      : ['Email'];
  }
  if (CUSTOMER_TYPES.has(type)) {
    if (recipient.role !== 'Customer') return [];
    return recipient.userId && recipient.hasAccessibleAccount !== false
      ? ['Email', 'InApp']
      : ['Email'];
  }
  if (INTERNAL_ROLES[type]) {
    return recipient.role === INTERNAL_ROLES[type]
      && recipient.userId
      && recipient.hasAccessibleAccount !== false
      ? ['InApp']
      : [];
  }
  const error = new Error('Notification channel policy is not defined for this type');
  error.code = 'NOTIFICATION_POLICY_UNDEFINED';
  throw error;
}

module.exports = { assertNotificationRecipientSelector, resolveNotificationChannels };
