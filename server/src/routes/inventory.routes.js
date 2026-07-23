const express = require('express');
const inventoryController = require('../controller/inventory.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/warehouse/inventory', authenticate, authorizeRoles('WarehouseManager'), inventoryController.listInventory);
router.get('/warehouse/inventory/low-stock', authenticate, authorizeRoles('WarehouseManager'), inventoryController.listLowStock);
router.get('/warehouse/inventory/low-stock-alerts', authenticate, authorizeRoles('WarehouseManager'), inventoryController.listLowStockAlerts);
router.get('/warehouse/inventory/:id', authenticate, authorizeRoles('WarehouseManager'), inventoryController.getInventory);
router.get('/warehouse/inventory-transactions', authenticate, authorizeRoles('WarehouseManager', 'Admin'), inventoryController.listTransactions);
router.patch('/warehouse/inventory/:id/adjust', authenticate, authorizeRoles('WarehouseManager'), inventoryController.adjustInventory);
router.post('/warehouse/inventory/:id/physical-count', authenticate, authorizeRoles('WarehouseManager'), inventoryController.recordPhysicalCount);
router.post('/warehouse/inventory/:id/count', authenticate, authorizeRoles('WarehouseManager'), inventoryController.recordPhysicalCount);
router.patch('/warehouse/inventory/:id/threshold', authenticate, authorizeRoles('WarehouseManager'), inventoryController.setThresholdOverride);
router.patch('/warehouse/inventory/:id/threshold-override', authenticate, authorizeRoles('WarehouseManager'), inventoryController.setThresholdOverride);

router.get('/warehouse/stock-exports', authenticate, authorizeRoles('WarehouseManager'), inventoryController.listStockExports);
router.get('/warehouse/stock-exports/:id', authenticate, authorizeRoles('WarehouseManager'), inventoryController.getStockExport);
router.patch('/warehouse/stock-exports/:id/status', authenticate, authorizeRoles('WarehouseManager'), inventoryController.updateStockExportStatus);

module.exports = router;
