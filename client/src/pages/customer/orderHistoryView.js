export const ORDER_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'payment', label: 'Chờ thanh toán' },
  { id: 'pending', label: 'Chờ xác nhận' },
  { id: 'processing', label: 'Đang xử lý' },
  { id: 'shipping', label: 'Đang giao' },
  { id: 'completed', label: 'Hoàn thành' },
  { id: 'cancelled', label: 'Đã hủy' },
];

export function orderTabFor(order = {}) {
  if (['Cancelled', 'Returned'].includes(order.orderStatus)) return 'cancelled';
  if (order.orderStatus === 'Delivered') return 'completed';
  if (['Shipped', 'DeliveryFailed'].includes(order.orderStatus)) return 'shipping';
  if (['Confirmed', 'StockExportRequested', 'Packed'].includes(order.orderStatus)) return 'processing';
  if (
    order.orderStatus === 'Pending'
    && order.paymentMethod === 'ONLINE'
    && ['Pending', 'Failed', 'Unpaid'].includes(order.paymentStatus)
  ) return 'payment';
  return 'pending';
}

export function filterOrdersByTab(orders = [], tab = 'all') {
  return tab === 'all' ? orders : orders.filter((order) => orderTabFor(order) === tab);
}

export function getOrderActions(order = {}, now = new Date()) {
  const deadline = order.paymentDeadlineAt ? new Date(order.paymentDeadlineAt) : null;
  const beforeDeadline = Boolean(deadline)
    && !Number.isNaN(deadline.getTime())
    && now.getTime() < deadline.getTime();
  return {
    canPay: order.orderStatus === 'Pending'
      && order.paymentMethod === 'ONLINE'
      && ['Unpaid', 'Pending', 'Failed'].includes(order.paymentStatus)
      && beforeDeadline,
    canCancel: order.orderStatus === 'Pending'
      && ['Unpaid', 'Pending', 'Failed', 'Paid'].includes(order.paymentStatus),
    canReview: order.orderStatus === 'Delivered',
  };
}
