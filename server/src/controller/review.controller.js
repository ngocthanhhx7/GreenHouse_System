const { reviewService } = require('../services/review.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listProductReviews(req, res, next) {
  try {
    return sendSuccess(res, await reviewService.listProductReviews(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function createCustomerReview(req, res, next) {
  try {
    return sendSuccess(res, await reviewService.createCustomerReview(req.user.id, req.params.id, req.body), 'Product review created', 201);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listProductReviews,
  createCustomerReview,
};
