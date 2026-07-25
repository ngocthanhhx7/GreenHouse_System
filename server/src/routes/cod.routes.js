const express = require('express');
const codController = require('../controller/cod.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');
const { carrierSignature } = require('../middlewares/carrierSignature.middleware');

const router = express.Router();

router.post('/carrier/orders/:id/cod-collection', carrierSignature, codController.recordCollection);
router.post('/carrier/orders/:id/cod-settlement', carrierSignature, codController.recordSettlement);
router.post('/staff/orders/:id/cod-collection', authenticate, authorizeRoles('Staff'), codController.recordStaffCollection);
router.get('/warehouse/cod-recoveries', authenticate, authorizeRoles('WarehouseManager'), codController.listRecoveryCandidates);
router.get('/warehouse/cod-recoveries/:id', authenticate, authorizeRoles('WarehouseManager'), codController.getRecoveryCandidate);
router.post('/warehouse/orders/:id/cod-recovery-receipt', authenticate, authorizeRoles('WarehouseManager'), codController.recordGoodsRecovery);
router.post('/staff/orders/:id/cod-recovery', authenticate, authorizeRoles('Staff'), codController.finalizeRecovery);

module.exports = router;
