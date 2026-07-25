function inventoryRecordOf(value) {
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'inventory')) {
    return value.inventory || null;
  }
  return value;
}

function inventoryQuantitiesOf(value) {
  const inventory = inventoryRecordOf(value);
  if (!inventory) return null;

  const rawSellable = inventory.sellableQuantity
    ?? inventory.stockQuantity
    ?? value?.availableQuantity;
  const sellableQuantity = Number(rawSellable);
  const reservedQuantity = Number(inventory.reservedQuantity || 0);
  if (
    rawSellable === undefined
    || !Number.isInteger(sellableQuantity)
    || sellableQuantity < 0
    || !Number.isInteger(reservedQuantity)
    || reservedQuantity < 0
  ) {
    return null;
  }
  return { sellableQuantity, reservedQuantity };
}

function inventoryHealthOf(value) {
  const inventory = inventoryRecordOf(value);
  if (!inventory) return 'Missing';
  if (inventory.inventoryHealth === 'Normal') return 'Normal';
  if (inventory.inventoryHealth === 'ReconciliationRequired') {
    return 'ReconciliationRequired';
  }

  const quantities = inventoryQuantitiesOf(value);
  if (!quantities || quantities.reservedQuantity > quantities.sellableQuantity) {
    return 'ReconciliationRequired';
  }
  return 'Normal';
}

function availableQuantityOf(value) {
  if (inventoryHealthOf(value) !== 'Normal') return 0;
  const quantities = inventoryQuantitiesOf(value);
  if (!quantities) return 0;
  return Math.max(0, quantities.sellableQuantity - quantities.reservedQuantity);
}

function availabilityStatusOf(value) {
  return availableQuantityOf(value) > 0 ? 'InStock' : 'OutOfStock';
}

module.exports = {
  availabilityStatusOf,
  availableQuantityOf,
  inventoryHealthOf,
};
