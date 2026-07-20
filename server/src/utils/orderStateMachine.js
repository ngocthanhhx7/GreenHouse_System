const ORDER_STATUS_TRANSITIONS = {
  Confirmed: ['StockExportRequested'],
  Packed: ['Shipped'],
  Shipped: ['Delivered'],
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
