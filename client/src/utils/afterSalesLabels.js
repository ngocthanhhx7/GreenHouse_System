export const EXCHANGE_STATUSES = [
  'AwaitingCODReconciliation',
  'CODRecoveryInProgress',
  'ClosedByCODRecovery',
  'Submitted',
  'AwaitingExactStockChoice',
  'WaitingForExactStock',
  'ApprovedAwaitingShipment',
  'CustomerShipped',
  'WarehouseInspecting',
  'OutboundFulfillment',
  'ReplacementShipped',
  'DeliveryIncident',
  'Rejected',
  'Cancelled',
  'Expired',
  'ClosedNoExchange',
  'ConvertedToReturnRefund',
  'Completed',
];

const EXCHANGE_STATUS_LABELS = {
  AwaitingCODReconciliation: 'Chờ đối soát COD',
  CODRecoveryInProgress: 'Đang thu hồi COD',
  ClosedByCODRecovery: 'Đã đóng sau thu hồi COD',
  Submitted: 'Đã gửi yêu cầu',
  AwaitingExactStockChoice: 'Chờ chọn cách xử lý khi thiếu đúng hàng',
  WaitingForExactStock: 'Đang chờ đúng sản phẩm',
  ApprovedAwaitingShipment: 'Đã duyệt, chờ khách bàn giao',
  CustomerShipped: 'Khách đã bàn giao hàng',
  WarehouseInspecting: 'Kho đang kiểm hàng',
  OutboundFulfillment: 'Đang chuẩn bị hàng giao ra',
  ReplacementShipped: 'Hàng thay thế đang được giao',
  DeliveryIncident: 'Có sự cố vận chuyển',
  Rejected: 'Đã từ chối',
  Cancelled: 'Đã hủy',
  Expired: 'Đã hết hạn bàn giao',
  ClosedNoExchange: 'Đã đóng, không đổi hàng',
  ConvertedToReturnRefund: 'Đã chuyển sang trả hàng/hoàn tiền',
  Completed: 'Đã hoàn tất',
};

const SHIPMENT_STATUS_LABELS = {
  InTransit: 'Đang vận chuyển',
  Delivered: 'Đã giao',
  Incident: 'Có sự cố',
};

const SHIPMENT_EVENT_TYPE_LABELS = {
  DELIVERED: 'Đã giao',
  LOST: 'Thất lạc',
  DAMAGED: 'Hư hỏng khi vận chuyển',
  DISPUTED: 'Khách hàng khiếu nại sự kiện giao hàng',
  CORRECTION: 'Đính chính có truy vết',
};

const SHIPMENT_DIRECTION_LABELS = {
  CUSTOMER_TO_WAREHOUSE: 'Khách gửi hàng về kho',
  REPLACEMENT_TO_CUSTOMER: 'Giao hàng thay thế cho khách',
  REJECTED_ORIGINAL_TO_CUSTOMER: 'Trả hàng gốc bị từ chối cho khách',
};

const SHIPPING_PAYER_LABELS = {
  '': 'Chưa quyết định',
  SHOP: 'Cửa hàng',
  CUSTOMER: 'Khách hàng',
};

const EXCHANGE_RESPONSIBILITY_LABELS = {
  '': 'Chưa quyết định',
  SHOP_FAULT: 'Lỗi thuộc cửa hàng',
  CUSTOMER_PREFERENCE: 'Nhu cầu cá nhân của khách hàng',
};

const NOTIFICATION_TYPE_LABELS = {
  EXCHANGE_REJECTED: 'Yêu cầu đổi hàng bị từ chối',
  EXCHANGE_COMPLETED: 'Đổi hàng đã hoàn tất',
};

export function translateExchangeStatus(status) {
  return EXCHANGE_STATUS_LABELS[status] || 'Trạng thái đổi hàng chưa xác định';
}

export function translateShipmentStatus(status) {
  return SHIPMENT_STATUS_LABELS[status] || 'Trạng thái vận chuyển chưa xác định';
}

export function translateShipmentEventType(eventType) {
  return SHIPMENT_EVENT_TYPE_LABELS[eventType] || 'Sự kiện vận chuyển chưa xác định';
}

export function translateShipmentDirection(direction) {
  return SHIPMENT_DIRECTION_LABELS[direction] || 'Chiều vận chuyển chưa xác định';
}

export function translateShippingPayer(payer) {
  return SHIPPING_PAYER_LABELS[payer ?? ''] || 'Bên chịu phí chưa xác định';
}

export function translateExchangeResponsibility(responsibility) {
  return EXCHANGE_RESPONSIBILITY_LABELS[responsibility ?? '']
    || 'Trách nhiệm chưa xác định';
}

export function translateAfterSalesNotificationType(type) {
  return NOTIFICATION_TYPE_LABELS[type] || '';
}
