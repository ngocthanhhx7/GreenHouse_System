const TYPE_LABELS = {
  PAYMENT_STATUS: 'Thanh toán',
  ORDER_STATUS: 'Đơn hàng',
  STAFF_QUEUE: 'Xử lý đơn hàng',
  LOW_STOCK: 'Cảnh báo tồn kho',
  REPORT_READY: 'Báo cáo quản trị',
  STOCK_EXPORT: 'Xuất kho',
  RETURN_REFUND: 'Đổi trả và hoàn tiền',
  SUPPORT: 'Hỗ trợ khách hàng',
};

export function translateNotificationType(type) {
  return TYPE_LABELS[type] || 'Thông báo hệ thống';
}
