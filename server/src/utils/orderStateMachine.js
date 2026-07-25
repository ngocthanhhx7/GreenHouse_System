const ORDER_STATUS_TRANSITIONS = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Packed', 'Cancelled'],
  Packed: ['Shipped'],
  Shipped: ['Delivered'],
  Delivered: ['Returned'],
};

function getAllowedOrderStatusTransitions(currentStatus) {
  return ORDER_STATUS_TRANSITIONS[currentStatus] || [];
}

function canTransitionOrderStatus(currentStatus, nextStatus) {
  return getAllowedOrderStatusTransitions(currentStatus).includes(nextStatus);
}

module.exports = {
  canTransitionOrderStatus,
  getAllowedOrderStatusTransitions,
};
