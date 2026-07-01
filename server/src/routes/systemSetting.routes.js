const express = require('express');
const systemSettingController = require('../controller/systemSetting.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/admin/settings', authenticate, authorizeRoles('Admin'), systemSettingController.listSettings);
router.patch('/admin/settings', authenticate, authorizeRoles('Admin'), systemSettingController.updateSettings);

module.exports = router;
