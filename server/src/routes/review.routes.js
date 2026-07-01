const express = require('express');
const reviewController = require('../controller/review.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/products/:id/reviews', reviewController.listProductReviews);
router.post('/products/:id/reviews', authenticate, authorizeRoles('Customer'), reviewController.createCustomerReview);

module.exports = router;
