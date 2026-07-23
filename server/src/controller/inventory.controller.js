const { inventoryService } = require('../services/inventory.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listInventory(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.listInventory());
  } catch (error) {
    return next(error);
  }
}

async function getInventory(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.getInventory(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function adjustInventory(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.adjustInventory(req.user.id, req.params.id, req.body), 'Inventory adjusted');
  } catch (error) {
    return next(error);
  }
}

async function recordPhysicalCount(req, res, next) {
  try {
    return sendSuccess(
      res,
      await inventoryService.recordPhysicalCount(req.user.id, req.params.id, req.body),
      'Physical inventory count recorded',
    );
  } catch (error) {
    return next(error);
  }
}

async function setThresholdOverride(req, res, next) {
  try {
    return sendSuccess(
      res,
      await inventoryService.setThresholdOverride(req.user.id, req.params.id, req.body),
      'Inventory threshold updated',
    );
  } catch (error) {
    return next(error);
  }
}

async function listLowStock(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.listLowStock());
  } catch (error) {
    return next(error);
  }
}

async function listLowStockAlerts(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.listLowStockAlerts(req.query));
  } catch (error) {
    return next(error);
  }
}

async function listStockExports(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.listStockExports());
  } catch (error) {
    return next(error);
  }
}

async function listTransactions(req, res, next) {
  try {
    const result = await inventoryService.listTransactions(req.query);
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

async function getStockExport(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.getStockExport(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function updateStockExportStatus(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.updateStockExportStatus(req.user.id, req.params.id, req.body), 'Stock export status updated');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listInventory,
  getInventory,
  adjustInventory,
  listLowStock,
  listStockExports,
  getStockExport,
  updateStockExportStatus,
  recordPhysicalCount,
  setThresholdOverride,
  listLowStockAlerts,
  listTransactions,
};
