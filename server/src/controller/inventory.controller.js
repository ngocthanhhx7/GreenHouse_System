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

async function listLowStock(req, res, next) {
  try {
    return sendSuccess(res, await inventoryService.listLowStock());
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
};
