export const ORDER_PROGRESS_STATUSES = Object.freeze([
  'Pending',
  'Confirmed',
  'Packed',
  'Shipped',
  'Delivered',
]);

export function getOrderProgress(currentStatus) {
  const currentIndex = ORDER_PROGRESS_STATUSES.indexOf(currentStatus);
  if (currentIndex < 0) {
    return ORDER_PROGRESS_STATUSES.map((status) => ({ status, state: 'terminal' }));
  }
  return ORDER_PROGRESS_STATUSES.map((status, index) => ({
    status,
    state: index < currentIndex
      ? 'complete'
      : index === currentIndex
        ? 'current'
        : 'upcoming',
  }));
}
