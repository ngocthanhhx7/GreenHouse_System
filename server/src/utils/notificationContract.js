const NOTIFICATION_TYPES = Object.freeze([
  'ACCOUNT_REGISTRATION_COMPLETED',
  'INTERNAL_INVITATION_CREATED',
  'INTERNAL_INVITATION_ACCEPTED',
  'PASSWORD_RESET_COMPLETED',
  'PROFILE_PASSWORD_CHANGED',
  'ACCOUNT_DISABLED',
  'ACCOUNT_REACTIVATED',
  'ORDER_RECEIVED',
  'ORDER_STATUS',
  'ORDER_CONFIRMED',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'ORDER_COMPLETED_BY_CUSTOMER',
  'CUSTOMER_DELIVERY_DISPUTED',
  'ORDER_CANCELLED',
  'ORDER_RETURNED',
  'ORDER_PAYMENT_EXPIRED',
  'DELIVERY_ATTEMPT_FAILED',
  'DELIVERY_RESCHEDULED',
  'DELIVERY_FAILED',
  'PAYMENT_STATUS',
  'PAYMENT_RECONCILED',
  'REFUND_PENDING',
  'REFUND_COMPLETED',
  'RETURN_REFUND',
  'RETURN_REFUND_APPROVED',
  'RETURN_REFUND_REJECTED',
  'RETURN_REFUND_EXPIRED',
  'RETURN_REFUND_RECEIVED',
  'RETURN_REFUND_COMPLETED',
  'REFUND_DESTINATION_VERIFIED',
  'REFUND_DESTINATION_REJECTED',
  'REFUND_PAYOUT_INCIDENT_OPENED',
  'EXCHANGE_APPROVED',
  'EXCHANGE_REJECTED',
  'EXCHANGE_RECEIVED',
  'EXCHANGE_COMPLETED',
  'REVIEW_MODERATION_CHANGED',
  'REVIEW_ALLOWED',
  'REVIEW_HIDDEN',
  'SUPPORT_MESSAGE_APPENDED',
  'SUPPORT_RESOLVED',
  'SUPPORT_RESPONSE_VISIBLE',
  'SUPPORT_STATUS',
  'SUPPORT_CLAIMED',
  'SUPPORT_TRANSFERRED',
  'ASSIGNEE_CLEARED',
  'INVENTORY_ADJUSTED',
  'INVENTORY_EXPORT',
  'LOW_STOCK_OPENED',
  'STOCK_EXPORT',
  'STOCK_EXPORT_APPROVED',
  'STOCK_EXPORT_REJECTED',
  'DAMAGE_REPORTED',
  'DAMAGE_DECIDED',
  'REPLENISHMENT_REQUESTED',
  'REPLENISHMENT_APPROVED',
  'REPLENISHMENT_REJECTED',
  'REPLENISHMENT_RECEIVED',
  'INSPECTION_ASSIGNED',
  'INSPECTION_COMPLETED',
]);

const TARGET_COLLECTIONS = Object.freeze([
  '',
  'Order',
  'ReturnRefundRequest',
  'ExchangeCase',
  'ProductReview',
  'SupportRequest',
  'Inventory',
  'LowStockAlert',
  'StockExportRequest',
  'ReplenishmentRequest',
  'DamageReport',
]);

const DISPLAY_VALUE_KEYS = Object.freeze([
  'orderCode',
  'paymentStatus',
  'requestCode',
  'caseCode',
  'ticketCode',
  'productName',
  'availableQuantity',
  'effectiveThreshold',
  'quantity',
  'roleName',
]);

const TYPE_DISPLAY_VALUES = Object.freeze(Object.fromEntries(
  NOTIFICATION_TYPES.map((type) => {
    if (type.startsWith('ORDER_') || type.startsWith('DELIVERY_') || type === 'CUSTOMER_DELIVERY_DISPUTED') {
      return [type, ['orderCode']];
    }
    if (type.startsWith('PAYMENT_')) return [type, ['orderCode', 'paymentStatus']];
    if (type.startsWith('RETURN_') || type.startsWith('REFUND_')) return [type, ['requestCode']];
    if (type.startsWith('EXCHANGE_')) return [type, ['caseCode']];
    if (type.startsWith('SUPPORT_')) return [type, ['ticketCode']];
    if (type.startsWith('REVIEW_')) return [type, ['productName']];
    if (type === 'LOW_STOCK_OPENED') return [type, ['productName', 'availableQuantity', 'effectiveThreshold']];
    if (type.startsWith('REPLENISHMENT_') || type.startsWith('STOCK_EXPORT_') || type === 'STOCK_EXPORT') {
      return [type, ['productName', 'quantity']];
    }
    if (type.startsWith('INVENTORY_') || type.startsWith('DAMAGE_') || type.startsWith('INSPECTION_')) {
      return [type, ['productName', 'quantity']];
    }
    if (type.includes('INVITATION')) return [type, ['roleName']];
    return [type, []];
  })
));

const COPY = Object.freeze({
  ORDER_COMPLETED_BY_CUSTOMER: ['Đơn hàng {orderCode} đã hoàn tất', 'Bạn đã xác nhận đã nhận đơn hàng {orderCode}. Cảm ơn bạn đã mua sắm tại GreenHome.'],
  CUSTOMER_DELIVERY_DISPUTED: ['Đơn hàng {orderCode} cần hỗ trợ giao hàng', 'Bạn đã báo chưa nhận được đơn hàng {orderCode}. Nhân viên GreenHome sẽ hỗ trợ bạn.'],
  ORDER_RECEIVED: ['Đã nhận đơn hàng {orderCode}', 'GreenHome đã nhận đơn hàng {orderCode}.'],
  ORDER_CONFIRMED: ['Đơn hàng {orderCode} đã được xác nhận', 'Đơn hàng {orderCode} đã được xác nhận.'],
  ORDER_SHIPPED: ['Đơn hàng {orderCode} đang được giao', 'Đơn hàng {orderCode} đã được bàn giao cho đơn vị vận chuyển.'],
  ORDER_DELIVERED: ['Đơn hàng {orderCode} đã giao', 'Đơn hàng {orderCode} đã được ghi nhận giao thành công.'],
  ORDER_CANCELLED: ['Đơn hàng {orderCode} đã hủy', 'Đơn hàng {orderCode} đã được hủy.'],
  ORDER_PAYMENT_EXPIRED: ['Thanh toán đơn {orderCode} đã hết hạn', 'Đơn hàng {orderCode} đã được hủy do quá hạn thanh toán.'],
  DELIVERY_ATTEMPT_FAILED: ['Giao đơn {orderCode} chưa thành công', 'Lần giao gần nhất chưa thành công. Vui lòng xem tiến trình đơn hàng.'],
  DELIVERY_RESCHEDULED: ['Đã cập nhật lịch giao đơn {orderCode}', 'Lịch giao mới đã được ghi nhận.'],
  DELIVERY_FAILED: ['Không thể giao đơn {orderCode}', 'Vui lòng xem đơn hàng để biết phương án xử lý tiếp theo.'],
  PAYMENT_STATUS: ['Cập nhật thanh toán đơn {orderCode}', 'Trạng thái thanh toán: {paymentStatus}.'],
  RETURN_REFUND_APPROVED: ['Yêu cầu {requestCode} đã được duyệt', 'Yêu cầu trả hàng hoặc hoàn tiền đã được duyệt.'],
  RETURN_REFUND_REJECTED: ['Yêu cầu {requestCode} chưa được duyệt', 'Vui lòng xem hồ sơ để biết kết quả xử lý.'],
  RETURN_REFUND_COMPLETED: ['Yêu cầu {requestCode} đã hoàn tất', 'Hồ sơ trả hàng hoặc hoàn tiền đã hoàn tất.'],
  EXCHANGE_REJECTED: ['Yêu cầu đổi hàng {caseCode} chưa được duyệt', 'Vui lòng xem hồ sơ đổi hàng để biết kết quả.'],
  EXCHANGE_COMPLETED: ['Yêu cầu đổi hàng {caseCode} đã hoàn tất', 'Hồ sơ đổi hàng đã hoàn tất.'],
  REVIEW_MODERATION_CHANGED: ['Kết quả kiểm duyệt đánh giá', 'Trạng thái hiển thị đánh giá của bạn đã được cập nhật.'],
  SUPPORT_MESSAGE_APPENDED: ['Hỗ trợ đã phản hồi yêu cầu {ticketCode}', 'Yêu cầu hỗ trợ của bạn có phản hồi mới.'],
  SUPPORT_RESOLVED: ['Yêu cầu {ticketCode} đã có kết quả', 'Yêu cầu hỗ trợ của bạn đã được xử lý.'],
  LOW_STOCK_OPENED: ['Cảnh báo tồn kho thấp', '{productName} còn {availableQuantity}, ngưỡng cảnh báo {effectiveThreshold}.'],
  REPLENISHMENT_REQUESTED: ['Yêu cầu bổ sung hàng mới', 'Một yêu cầu bổ sung hàng đang chờ phê duyệt.'],
  REPLENISHMENT_APPROVED: ['Yêu cầu bổ sung hàng đã duyệt', 'Yêu cầu bổ sung hàng đã được duyệt.'],
  REPLENISHMENT_REJECTED: ['Yêu cầu bổ sung hàng bị từ chối', 'Yêu cầu bổ sung hàng chưa được duyệt.'],
  REPLENISHMENT_RECEIVED: ['Đã ghi nhận hàng bổ sung', 'Kho đã ghi nhận hàng bổ sung.'],
});

function normalizeNotificationType(value) {
  const type = String(value || '').trim().toUpperCase();
  if (type === 'ORDER_CREATED') return 'ORDER_RECEIVED';
  if (!NOTIFICATION_TYPES.includes(type)) {
    const error = new Error('Notification type is not allowed');
    error.code = 'NOTIFICATION_TYPE_NOT_ALLOWED';
    throw error;
  }
  return type;
}

function plainDisplayValues(value) {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function sanitizeDisplayValues(typeValue, values, { rejectUnknown = false } = {}) {
  const type = normalizeNotificationType(typeValue);
  const allowed = new Set(TYPE_DISPLAY_VALUES[type] || []);
  const source = plainDisplayValues(values);
  const safe = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) {
      if (rejectUnknown) throw new Error(`Notification display value ${key} is not allowed for ${type}`);
      continue;
    }
    if (!DISPLAY_VALUE_KEYS.includes(key)) throw new Error(`Notification display value ${key} is not allowed`);
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      if (rejectUnknown) throw new Error(`Notification display value ${key} must be scalar`);
      continue;
    }
    const normalized = typeof value === 'string' ? value.trim().slice(0, 120) : value;
    if (normalized !== '') safe[key] = normalized;
  }
  return safe;
}

function interpolate(template, values) {
  return template.replace(/\{([A-Za-z]+)\}/g, (_match, key) => {
    const value = values[key];
    return value === null || value === undefined ? '' : String(value).trim();
  });
}

function humanizeType(type) {
  return type.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function renderNotification(typeValue, templateKeyValue, displayValues) {
  const type = normalizeNotificationType(typeValue);
  const templateKey = normalizeNotificationType(templateKeyValue || type);
  if (templateKey !== type) throw new Error('Notification template does not match its type');
  const values = sanitizeDisplayValues(type, displayValues, { rejectUnknown: true });
  const [subjectTemplate, contentTemplate] = COPY[templateKey] || [humanizeType(templateKey), 'Có cập nhật mới. Vui lòng mở thông báo để xem chi tiết.'];
  return {
    subject: interpolate(subjectTemplate, values).replace(/\s+/g, ' ').trim(),
    content: interpolate(contentTemplate, values).replace(/\s+/g, ' ').trim(),
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

module.exports = {
  DISPLAY_VALUE_KEYS,
  NOTIFICATION_TYPES,
  TARGET_COLLECTIONS,
  TYPE_DISPLAY_VALUES,
  deepFreeze,
  normalizeNotificationType,
  renderNotification,
  sanitizeDisplayValues,
};
