const express = require('express');
const fulfillmentController = require('../controller/fulfillment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');
const { carrierSignature } = require('../middlewares/carrierSignature.middleware');
const { validateObjectIdParam } = require('../middlewares/validateRequest.middleware');

const router = express.Router();

router.post('/staff/orders/:id/packing', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), fulfillmentController.confirmPacking);
router.post('/staff/orders/:id/shipments', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), fulfillmentController.recordHandoff);
router.post('/staff/shipments/:shipmentId/events', authenticate, authorizeRoles('Staff'), validateObjectIdParam('shipmentId'), fulfillmentController.recordStaffShipmentEvent);
router.post('/staff/orders/:id/destination-versions', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), fulfillmentController.addStaffDestinationVersion);
router.post('/staff/orders/:id/delivery-resolution', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), fulfillmentController.resolveDeliveryFailure);
router.get('/staff/orders/:id/fulfillment', authenticate, authorizeRoles('Staff'), validateObjectIdParam(), fulfillmentController.getStaffFulfillment);

router.get('/warehouse/returned-parcels', authenticate, authorizeRoles('WarehouseManager'), fulfillmentController.listReturnedParcels);
router.post('/warehouse/shipments/:shipmentId/returned-receipt', authenticate, authorizeRoles('WarehouseManager'), fulfillmentController.recordReturnedReceipt);

router.get('/orders/:id/fulfillment', authenticate, authorizeRoles('Customer'), validateObjectIdParam(), fulfillmentController.getCustomerFulfillment);
router.post('/orders/:id/destination-corrections', authenticate, authorizeRoles('Customer'), validateObjectIdParam(), fulfillmentController.addCustomerDestinationVersion);
router.post('/orders/:id/delivery-incidents/:incidentId/choice', authenticate, authorizeRoles('Customer'), validateObjectIdParam(), fulfillmentController.chooseIncidentResolution);

router.post('/carrier/shipments/:shipmentId/events', carrierSignature, fulfillmentController.recordCarrierShipmentEvent);

module.exports = router;
