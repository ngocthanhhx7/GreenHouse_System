const express = require('express');
const exchangeController = require('../controller/exchange.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');
const { carrierSignature } = require('../middlewares/carrierSignature.middleware');

const router = express.Router();

router.post('/orders/:id/exchanges', authenticate, authorizeRoles('Customer'), exchangeController.createCustomerRequest);
router.get('/exchanges/my', authenticate, authorizeRoles('Customer'), exchangeController.listMyRequests);
router.get('/exchanges/:id', authenticate, authorizeRoles('Customer'), exchangeController.getCustomerRequest);
router.post('/exchanges/:id/handoff-proof', authenticate, authorizeRoles('Customer'), exchangeController.recordHandoffProof);
router.post('/exchanges/:id/cancel', authenticate, authorizeRoles('Customer'), exchangeController.cancelRequest);
router.post('/exchanges/:id/stock-choice', authenticate, authorizeRoles('Customer'), exchangeController.chooseStockOption);
router.post('/exchanges/:id/shipments/:shipmentId/disputes', authenticate, authorizeRoles('Customer'), exchangeController.reportShipmentDispute);

router.get('/staff/exchanges', authenticate, authorizeRoles('Staff'), exchangeController.listStaffRequests);
router.get('/staff/exchanges/:id', authenticate, authorizeRoles('Staff'), exchangeController.getStaffRequest);
router.patch('/staff/exchanges/:id/decision', authenticate, authorizeRoles('Staff'), exchangeController.decideRequest);
router.post('/staff/exchanges/:id/retry-reservation', authenticate, authorizeRoles('Staff'), exchangeController.retryReservation);
router.post('/staff/exchanges/:id/expire', authenticate, authorizeRoles('Staff'), exchangeController.expireRequest);
router.post('/staff/exchanges/:id/shipments/:shipmentId/events', authenticate, authorizeRoles('Staff'), exchangeController.recordStaffShipmentEvent);
router.post('/staff/exchanges/:id/resend', authenticate, authorizeRoles('Staff'), exchangeController.resendReplacement);

router.get('/warehouse/exchanges', authenticate, authorizeRoles('WarehouseManager'), exchangeController.listWarehouseRequests);
router.get('/warehouse/exchanges/:id', authenticate, authorizeRoles('WarehouseManager'), exchangeController.getWarehouseRequest);
router.post('/warehouse/exchanges/:id/receipt', authenticate, authorizeRoles('WarehouseManager'), exchangeController.recordWarehouseReceipt);
router.post('/warehouse/exchanges/:id/inspection', authenticate, authorizeRoles('WarehouseManager'), exchangeController.finalizeInspection);
router.post('/warehouse/exchanges/:id/shipments', authenticate, authorizeRoles('WarehouseManager'), exchangeController.createOutboundShipment);

router.post('/carrier/exchanges/shipments/:shipmentId/events', carrierSignature, exchangeController.recordCarrierShipmentEvent);

module.exports = router;
