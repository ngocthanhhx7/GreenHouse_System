const express = require('express');
const cartController = require('../controller/cart.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/cart', authenticate, authorizeRoles('Customer'), cartController.getCart);
router.post('/cart/items', authenticate, authorizeRoles('Customer'), cartController.addItem);
router.patch('/cart/items/:id', authenticate, authorizeRoles('Customer'), cartController.updateItem);
router.delete('/cart/items/:id', authenticate, authorizeRoles('Customer'), cartController.removeItem);

module.exports = router;
