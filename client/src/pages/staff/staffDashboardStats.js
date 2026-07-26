function responseTotal(response) {
  if (!response) return null;
  if (typeof response.total === 'number') return response.total;
  if (Array.isArray(response.items)) return response.items.length;
  return null;
}

export function toStaffDashboardStats({ orders, returns, newSupport, inProgressSupport }) {
  const pendingOrders = responseTotal(orders);
  const pendingReturns = responseTotal(returns);
  const newSupportTotal = responseTotal(newSupport);
  const inProgressSupportTotal = responseTotal(inProgressSupport);

  return {
    pendingOrders,
    pendingReturns,
    openSupport: newSupportTotal === null || inProgressSupportTotal === null
      ? null
      : newSupportTotal + inProgressSupportTotal,
  };
}
