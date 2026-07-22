const DEFAULT_PRODUCT_CURRENCY = 'VND';

export function formatCurrency(value, currency = DEFAULT_PRODUCT_CURRENCY) {
  const normalizedCurrency = String(currency || DEFAULT_PRODUCT_CURRENCY).trim().toUpperCase();
  const supportedCurrency = normalizedCurrency === DEFAULT_PRODUCT_CURRENCY ? normalizedCurrency : DEFAULT_PRODUCT_CURRENCY;

  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: supportedCurrency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatProductCurrency(product = {}) {
  return formatCurrency(product.price, product.currency || DEFAULT_PRODUCT_CURRENCY);
}

export function formatProductSku(sku) {
  const normalizedSku = String(sku || '').trim();
  return `SKU: ${normalizedSku || 'Chưa cập nhật'}`;
}

export function translateOrderStatus(status) {
  const labels = {
    Pending: 'Chờ xác nhận',
    WaitingForPayment: 'Chờ thanh toán',
    Confirmed: 'Đã xác nhận',
    StockExportRequested: 'Đang yêu cầu xuất kho',
    Packed: 'Đã đóng gói',
    Shipped: 'Đang giao',
    Delivered: 'Đã giao',
    Cancelled: 'Đã hủy',
    Expired: 'Đã hết hạn',
    Expired: 'Đã hết hạn thanh toán',
    Returned: 'Đã hoàn trả',
  };
  return labels[status] || status || 'Chưa xác định';
}

export function translatePaymentStatus(status) {
  const labels = {
    Unpaid: 'Chưa thanh toán',
    Pending: 'Chờ thanh toán',
    Paid: 'Đã thanh toán',
    Failed: 'Thanh toán lỗi',
    Cancelled: 'Đã hủy',
    Refunded: 'Đã hoàn tiền',
    RefundPending: 'Chờ hoàn tiền',
  };
  return labels[status] || status || 'Chưa xác định';
}

export function translatePaymentMethod(method) {
  const labels = {
    COD: 'Thanh toán khi nhận hàng',
    ONLINE: 'Thanh toán online',
  };
  return labels[method] || method || 'Chưa chọn';
}

export function translateRequestStatus(status) {
  const labels = {
    Pending: 'Chờ xử lý',
    AwaitingInspection: 'Chờ kiểm hàng',
    ReadyForRefund: 'Sẵn sàng hoàn tiền',
    Completed: 'Đã hoàn tất',
    Approved: 'Đã duyệt',
    Rejected: 'Đã từ chối',
    Processing: 'Đang xử lý',
    Exported: 'Đã xuất kho',
    Cancelled: 'Đã hủy',
    Received: 'Đã nhận hàng',
    New: 'Mới',
    Open: 'Đang mở',
    InProgress: 'Đang xử lý',
    Resolved: 'Đã giải quyết',
    Active: 'Đang hoạt động',
    Inactive: 'Ngừng hoạt động',
  };
  return labels[status] || status || 'Chưa xác định';
}

export function translateRole(role) {
  const labels = {
    Customer: 'Khách hàng',
    Staff: 'Nhân viên xử lý đơn',
    WarehouseManager: 'Quản lý kho',
    Admin: 'Quản trị viên',
  };
  return labels[role] || role || 'Người dùng';
}
