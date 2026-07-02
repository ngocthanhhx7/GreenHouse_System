export function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
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
    Returned: 'Đã hoàn trả',
  };
  return labels[status] || status || 'Chưa xác định';
}

export function translatePaymentStatus(status) {
  const labels = {
    Pending: 'Chờ thanh toán',
    Paid: 'Đã thanh toán',
    Failed: 'Thanh toán lỗi',
    Cancelled: 'Đã hủy',
    Refunded: 'Đã hoàn tiền',
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
    Approved: 'Đã duyệt',
    Rejected: 'Đã từ chối',
    Processing: 'Đang xử lý',
    Exported: 'Đã xuất kho',
    Cancelled: 'Đã hủy',
    Received: 'Đã nhận hàng',
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
