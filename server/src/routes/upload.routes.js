const express = require('express');

const uploadController = require('../controller/upload.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');
const { uploadAvatar, uploadProductImages } = require('../middlewares/upload.middleware');

const router = express.Router();

router.post(
  '/admin/uploads/products',
  authenticate,
  authorizeRoles('Admin', 'Staff'),
  uploadProductImages,
  uploadController.uploadProductImages
);
router.post('/profile/avatar', authenticate, uploadAvatar, uploadController.uploadAvatar);
router.delete('/profile/avatar', authenticate, uploadController.deleteAvatar);

module.exports = router;
