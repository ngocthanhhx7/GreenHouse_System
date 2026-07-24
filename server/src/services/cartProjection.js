function normalizeVersion(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function availableQuantityOf(product) {
  const inventory = product?.inventory || product;
  if (!inventory || inventory.inventoryHealth !== 'Normal') return 0;
  return Math.max(
    0,
    Number(inventory.sellableQuantity ?? inventory.stockQuantity ?? product.availableQuantity ?? 0)
      - Number(inventory.reservedQuantity || 0),
  );
}

function inventoryHealthOf(product) {
  return product?.inventory?.inventoryHealth || product?.inventoryHealth || 'Missing';
}

function categoryIsActive(product) {
  return Boolean(
    product?.categoryId
      && typeof product.categoryId === 'object'
      && product.categoryId.status === 'Active',
  );
}

function emptyCartProjection() {
  return {
    id: null,
    customerId: null,
    status: 'Empty',
    version: 0,
    items: [],
    subtotal: 0,
    shippingFee: 0,
    totalAmount: 0,
    canCheckout: false,
  };
}

function reconcileCartProjection(cart, items, productsById) {
  const mappedItems = items.map((item) => {
    const product = productsById.get(String(item.productId));
    const productPublished = Boolean(product?.status === 'Active' && categoryIsActive(product));
    const inventoryHealth = inventoryHealthOf(product);
    const availableQuantity = availableQuantityOf(product);
    const currentPrice = Number(product?.price ?? item.unitPrice);
    const currentVersion = normalizeVersion(
      product?.priceVersion || product?.updatedAt || item.priceVersion,
    );
    const previousVersion = normalizeVersion(item.priceVersion);
    const priceChanged = Number(item.unitPrice) !== currentPrice
      || (previousVersion && currentVersion && previousVersion !== currentVersion);
    const issues = [];
    if (priceChanged) {
      issues.push({
        code: 'PriceChanged',
        message: 'Product price changed after it was added to the Cart',
      });
    }
    if (!productPublished) {
      issues.push({
        code: 'Unavailable',
        message: 'Product or Category is no longer public',
      });
    }
    if (inventoryHealth !== 'Normal') {
      issues.push({
        code: 'InventoryReconciliation',
        message: 'Inventory is being reconciled',
      });
    }
    if (availableQuantity < Number(item.quantity)) {
      issues.push({
        code: 'InsufficientStock',
        message: 'Selected quantity exceeds current availability',
      });
    }
    const subtotal = currentPrice * Number(item.quantity);
    return {
      id: String(item._id),
      productId: String(item.productId?._id || item.productId),
      productName: product?.name || item.productName,
      imageUrl: Array.isArray(product?.imageUrls) ? product.imageUrls[0] || '' : '',
      category: product?.categoryId?.name
        ? { id: String(product.categoryId._id), name: product.categoryId.name }
        : null,
      quantity: Number(item.quantity),
      previousUnitPrice: Number(item.unitPrice),
      previousPriceVersion: previousVersion,
      unitPrice: currentPrice,
      priceVersion: currentVersion,
      priceChanged,
      availabilityStatus: productPublished && availableQuantity > 0 ? 'InStock' : 'OutOfStock',
      ...(availableQuantity < Number(item.quantity)
        ? { maxOrderableQuantity: availableQuantity }
        : {}),
      issues,
      subtotal,
    };
  });
  const subtotal = mappedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const blockingCodes = new Set([
    'Unavailable',
    'InsufficientStock',
    'InventoryReconciliation',
  ]);
  return {
    id: String(cart._id),
    customerId: String(cart.customerId),
    status: cart.status,
    version: Number(cart.version || 0),
    items: mappedItems,
    subtotal,
    shippingFee: 0,
    totalAmount: subtotal,
    canCheckout: mappedItems.length > 0 && mappedItems.every(
      (item) => item.issues.every((issue) => !blockingCodes.has(issue.code)),
    ),
  };
}

module.exports = {
  availableQuantityOf,
  categoryIsActive,
  emptyCartProjection,
  inventoryHealthOf,
  reconcileCartProjection,
};
