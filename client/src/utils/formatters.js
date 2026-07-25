const DEFAULT_PRODUCT_CURRENCY = "VND";

export function formatCurrency(value, currency = DEFAULT_PRODUCT_CURRENCY) {
  const normalizedCurrency = String(currency || DEFAULT_PRODUCT_CURRENCY)
    .trim()
    .toUpperCase();
  const supportedCurrency =
    normalizedCurrency === DEFAULT_PRODUCT_CURRENCY
      ? normalizedCurrency
      : DEFAULT_PRODUCT_CURRENCY;

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: supportedCurrency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatProductCurrency(product = {}) {
  return formatCurrency(
    product.price,
    product.currency || DEFAULT_PRODUCT_CURRENCY,
  );
}

export function formatProductSku(sku) {
  const normalizedSku = String(sku || "").trim();
  return `SKU: ${normalizedSku || "Chưa cập nhật"}`;
}

export function translateOrderStatus(status) {
  const labels = {
    Pending: "Chờ xác nhận",
    Confirmed: "Đã xác nhận",
    Packed: "Đã đóng gói",
    Shipped: "Đang giao",
    Delivered: "Đã giao",
    Cancelled: "Đã hủy",
    Returned: "Đã hoàn trả",
  };
  return labels[status] || status || "Chưa xác định";
}

export function translatePaymentStatus(status) {
  const labels = {
    Unpaid: "Chưa thanh toán",
    Pending: "Chờ thanh toán",
    Paid: "Đã thanh toán",
    Failed: "Thanh toán lỗi",
    Cancelled: "Đã hủy",
    Refunded: "Đã hoàn tiền",
    RefundPending: "Chờ hoàn tiền",
  };
  return labels[status] || status || "Chưa xác định";
}

export function translatePaymentMethod(method) {
  const labels = {
    COD: "Thanh toán khi nhận hàng",
    ONLINE: "Thanh toán online",
  };
  return labels[method] || method || "Chưa chọn";
}

export function translateShippingStatus(status) {
  const labels = {
    HandedOff: 'Đã bàn giao vận chuyển',
    AttemptFailed: 'Giao thất bại',
    Delivered: 'Đã giao thành công',
    ReturnedToShop: 'Đã trả về cửa hàng',
    Lost: 'Thất lạc',
    Damaged: 'Hư hỏng',
  };
  return labels[status] || status || 'Chưa bàn giao';
}

export function translateRequestStatus(status) {
  const labels = {
    Pending: "Chờ xử lý",
    AwaitingCODReconciliation: "Chờ đối soát COD",
    AwaitingInspection: "Chờ kiểm hàng",
    ReadyForRefund: "Sẵn sàng hoàn tiền",
    Completed: "Đã hoàn tất",
    Expired: "Đã quá hạn bàn giao",
    CODRecoveryInProgress: "Đang thu hồi COD",
    ClosedByCODRecovery: "Đã đóng sau thu hồi COD",
    Approved: "Đã duyệt",
    Rejected: "Đã từ chối",
    Processing: "Đang xử lý",
    Exported: "Đã xuất kho",
    Cancelled: "Đã hủy",
    Received: "Đã nhận hàng",
    New: "Mới",
    Open: "Đang mở",
    InProgress: "Đang xử lý",
    Resolved: "Đã giải quyết",
    Active: "Đang hoạt động",
    Inactive: "Ngừng hoạt động",
  };
  return labels[status] || status || "Chưa xác định";
}

export function translateRole(role) {
  const labels = {
    Customer: "Khách hàng",
    Staff: "Nhân viên xử lý đơn",
    WarehouseManager: "Quản lý kho",
    Admin: "Quản trị viên",
  };
  return labels[role] || role || "Người dùng";
}

export function translateSupportType(type) {
  const labels = {
    Order: "Đơn hàng",
    Payment: "Thanh toán",
    ReturnRefund: "Trả hàng/Hoàn tiền",
    Exchange: "Đổi hàng",
    Product: "Sản phẩm",
    Account: "Tài khoản",
    Other: "Khác",
  };
  return labels[type] || type || "Chưa xác định";
}

export function translateDeliveryChoice(choice) {
  const labels = {
    Resend: "Gửi lại hàng",
    Wait: "Chờ hàng",
    TerminalRefund: "Hoàn tiền toàn bộ",
  };
  return labels[choice] || choice || "Chưa xác định";
}

export function translateDeliveryIncidentType(type) {
  const labels = {
    Lost: "Thất lạc kiện hàng",
    Damaged: "Kiện hàng hư hỏng",
    Failed: "Giao hàng không thành công",
    Delayed: "Giao hàng chậm trễ",
    WrongItem: "Giao sai sản phẩm",
    MissingItem: "Thiếu sản phẩm",
  };
  return labels[type] || type || "Sự cố giao hàng";
}

export function translateDeliveryIncidentStatus(status) {
  const labels = {
    Open: "Đang chờ xử lý",
    AwaitingWarehouseReceipt: "Chờ kho nhận kiện hàng",
    AwaitingCustomerChoice: "Chờ bạn chọn hướng xử lý",
    Resending: "Đang gửi lại hàng",
    Waiting: "Đang chờ hàng",
    Refunding: "Đang hoàn tiền",
    Resolved: "Đã xử lý",
    Closed: "Đã đóng",
  };
  return labels[status] || status || "Chưa xác định";
}

export function translateFulfillmentCycleType(type) {
  const labels = {
    Initial: "Giao lần đầu",
    Resend: "Giao lại",
    Replacement: "Giao hàng thay thế",
    Return: "Trả hàng về kho",
  };
  return labels[type] || type || "Chưa xác định";
}

export function translateFulfillmentCycleStatus(status) {
  const labels = {
    Pending: "Đang chờ",
    InTransit: "Đang vận chuyển",
    Delivered: "Đã giao",
    Failed: "Không thành công",
    Incident: "Có sự cố",
    Completed: "Đã hoàn tất",
    Cancelled: "Đã hủy",
  };
  return labels[status] || status || "Chưa xác định";
}

export function translateStockLabel(label) {
  const labels = {
    Sellable: "Có thể bán",
    Reserved: "Đã giữ",
    Quarantined: "Đang cách ly",
    Damaged: "Hư hỏng",
    Available: "Khả dụng",
  };
  return labels[label] || label || "Chưa xác định";
}
