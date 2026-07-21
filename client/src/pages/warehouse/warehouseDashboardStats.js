function getEnvelope(response) {
  if (
    response
    && typeof response === 'object'
    && Array.isArray(response.items)
    && Number.isSafeInteger(response.total)
    && response.total >= 0
  ) {
    return response;
  }
  return null;
}

function getTotal(response) {
  if (Array.isArray(response)) return response.length;
  return getEnvelope(response)?.total ?? null;
}

function getItems(response) {
  if (Array.isArray(response)) return response;
  return getEnvelope(response)?.items ?? null;
}

export function getWarehouseDashboardStats({ inventory, lowStock, stockExports } = {}) {
  const exports = getItems(stockExports);

  return {
    totalItems: getTotal(inventory),
    lowStock: getTotal(lowStock),
    pendingExports: exports ? exports.filter((stockExport) => stockExport?.status === 'Pending').length : null,
  };
}
