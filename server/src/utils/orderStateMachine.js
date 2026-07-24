const ORDER_STATUS_TRANSITIONS = {
  Pending: ['Confirmed'],
  Confirmed: ['Packed'],
  Packed: ['Shipped'],
  Shipped: ['Delivered', 'DeliveryFailed'],
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
