const express = require('express');

const uploadController = require('../controller/upload.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');
const { uploadAvatar, uploadProductImages, uploadReturnEvidence } = require('../middlewares/upload.middleware');

const router = express.Router();

router.post(
  '/admin/uploads/products',
  authenticate,
  authorizeRoles('Admin'),
  uploadProductImages,
  uploadController.uploadProductImages
);
router.delete(
  '/admin/uploads/products',
  authenticate,
  authorizeRoles('Admin'),
  uploadController.deleteProductImage
);
router.post('/return-refunds/evidence', authenticate, authorizeRoles('Customer'), uploadReturnEvidence, uploadController.uploadReturnEvidence);
router.post(
  '/exchanges/evidence',
  authenticate,
  authorizeRoles('Customer', 'Staff', 'WarehouseManager'),
  uploadReturnEvidence,
  uploadController.uploadReturnEvidence
);
router.get(
  '/return-refunds/evidence/:filename',
  authenticate,
  authorizeRoles('Customer', 'Staff', 'WarehouseManager'),
  uploadController.getReturnEvidence
);
router.get(
  '/exchanges/evidence/:filename',
  authenticate,
  authorizeRoles('Customer', 'Staff', 'WarehouseManager'),
  uploadController.getReturnEvidence
);
router.post('/profile/avatar', authenticate, uploadAvatar, uploadController.uploadAvatar);
router.delete('/profile/avatar', authenticate, uploadController.deleteAvatar);

module.exports = router;
