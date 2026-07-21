function responseTotal(response) {
  if (!response) return null;
  if (typeof response.total === 'number') return response.total;
  if (Array.isArray(response.items)) return response.items.length;
  return null;
}

export function toStaffDashboardStats({ orders, returns, newSupport, openSupport, inProgressSupport }) {
  const pendingOrders = responseTotal(orders);
  const pendingReturns = responseTotal(returns);
  const newSupportTotal = responseTotal(newSupport);
  const openSupportTotal = responseTotal(openSupport);
  const inProgressSupportTotal = responseTotal(inProgressSupport);

  return {
    pendingOrders,
    pendingReturns,
    openSupport: newSupportTotal === null || openSupportTotal === null || inProgressSupportTotal === null
      ? null
      : newSupportTotal + openSupportTotal + inProgressSupportTotal,
  };
}
