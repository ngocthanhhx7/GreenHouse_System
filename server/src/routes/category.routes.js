const express = require('express');
const categoryController = require('../controller/category.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/categories', categoryController.listPublic);
router.get('/admin/categories', authenticate, authorizeRoles('Admin'), categoryController.listAdmin);
router.post('/admin/categories', authenticate, authorizeRoles('Admin'), categoryController.create);
router.patch('/admin/categories/:id', authenticate, authorizeRoles('Admin'), categoryController.update);
router.patch('/admin/categories/:id/status', authenticate, authorizeRoles('Admin'), categoryController.update);

module.exports = router;
