const express = require('express');
const productController = require('../controller/product.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/products', productController.listPublic);
router.get('/products/best-sellers', productController.listBestSellers);
router.get('/products/:id', productController.getPublicById);
router.get('/admin/products', authenticate, authorizeRoles('Admin'), productController.listAdmin);
router.post('/admin/products', authenticate, authorizeRoles('Admin'), productController.create);
router.patch('/admin/products/:id', authenticate, authorizeRoles('Admin'), productController.update);
router.patch('/admin/products/:id/status', authenticate, authorizeRoles('Admin'), productController.updateStatus);

module.exports = router;
