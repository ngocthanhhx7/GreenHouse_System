const express = require('express');

const profileController = require('../controller/profile.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/profile', authenticate, profileController.getProfile);
router.patch('/profile', authenticate, profileController.updateProfile);
router.patch('/profile/password', authenticate, profileController.changePassword);
router.get('/profile/addresses', authenticate, authorizeRoles('Customer'), profileController.listAddresses);
router.post('/profile/addresses', authenticate, authorizeRoles('Customer'), profileController.createAddress);
router.patch('/profile/addresses/:id', authenticate, authorizeRoles('Customer'), profileController.updateAddress);
router.patch('/profile/addresses/:id/default', authenticate, authorizeRoles('Customer'), profileController.setDefaultAddress);
router.delete('/profile/addresses/:id', authenticate, authorizeRoles('Customer'), profileController.deleteAddress);

module.exports = router;
