const ApiError = require('../utils/apiError');
const {
  createInventoryService: createInventoryCoreService,
  inventoryService: inventoryCoreService,
} = require('./inventoryCore.service');
const {
  createInventoryExportService,
} = require('./inventoryExport.service');

async function retiredLegacyMutation() {
  throw new ApiError(
    409,
    'Legacy Warehouse approval/status mutation is retired; use the exact process command',
    [],
    'STOCK_EXPORT_LEGACY_ACTION_RETIRED',
  );
}

function createInventoryService(options = {}) {
  return {
    ...createInventoryCoreService(options),
    ...createInventoryExportService(options),
    updateStockExportStatus: retiredLegacyMutation,
  };
}

const inventoryService = {
  ...inventoryCoreService,
  ...createInventoryExportService(),
  updateStockExportStatus: retiredLegacyMutation,
};

module.exports = { createInventoryService, inventoryService };
