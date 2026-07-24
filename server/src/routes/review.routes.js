const express = require('express');
const reviewController = require('../controller/review.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/authorize.middleware');

const router = express.Router();

router.get('/products/:productId/reviews', reviewController.listPublic);

router.get(
  '/customer/reviews',
  authenticate,
  authorizeRoles('Customer'),
  reviewController.listOwn,
);
router.post(
  '/products/:productId/reviews',
  authenticate,
  authorizeRoles('Customer'),
  reviewController.createReview,
);
router.patch(
  '/reviews/:reviewId',
  authenticate,
  authorizeRoles('Customer'),
  reviewController.updateReview,
);
router.patch(
  '/reviews/:reviewId/publication',
  authenticate,
  authorizeRoles('Customer'),
  reviewController.setPublication,
);

router.get(
  '/staff/reviews',
  authenticate,
  authorizeRoles('Staff'),
  reviewController.listModeration,
);
router.patch(
  '/staff/reviews/:reviewId/moderation',
  authenticate,
  authorizeRoles('Staff'),
  reviewController.moderate,
);

module.exports = router;
