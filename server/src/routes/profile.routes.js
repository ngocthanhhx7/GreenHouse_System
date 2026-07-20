const express = require('express');

const profileController = require('../controller/profile.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/profile', authenticate, profileController.getProfile);
router.patch('/profile', authenticate, profileController.updateProfile);
router.patch('/profile/password', authenticate, profileController.changePassword);
router.get('/profile/addresses', authenticate, profileController.listAddresses);
router.post('/profile/addresses', authenticate, profileController.createAddress);
router.patch('/profile/addresses/:id', authenticate, profileController.updateAddress);
router.patch('/profile/addresses/:id/default', authenticate, profileController.setDefaultAddress);
router.delete('/profile/addresses/:id', authenticate, profileController.deleteAddress);

module.exports = router;
