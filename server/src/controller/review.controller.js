const { reviewService } = require('../services/review.service');
const { sendSuccess } = require('../utils/apiResponse');

function commandFrom(body, fields) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  return Object.fromEntries(fields.map((field) => [field, source[field]]));
}

function commandOptions(req) {
  return { idempotencyKey: req.get('Idempotency-Key') };
}

async function listPublic(req, res, next) {
  try {
    return sendSuccess(
      res,
      await reviewService.listPublic(req.params.productId, req.query),
    );
  } catch (error) {
    return next(error);
  }
}

async function listOwn(req, res, next) {
  try {
    return sendSuccess(res, await reviewService.listOwn(req.user, req.query));
  } catch (error) {
    return next(error);
  }
}

async function createReview(req, res, next) {
  try {
    const command = commandFrom(req.body, [
      'orderDetailId',
      'rating',
      'content',
      'expectedVersion',
    ]);
    return sendSuccess(
      res,
      await reviewService.createReview(
        req.user,
        req.params.productId,
        command,
        commandOptions(req),
      ),
      'Product review created',
      201,
    );
  } catch (error) {
    return next(error);
  }
}

async function updateReview(req, res, next) {
  try {
    const command = commandFrom(req.body, ['rating', 'content', 'expectedVersion']);
    return sendSuccess(
      res,
      await reviewService.updateReview(
        req.user,
        req.params.reviewId,
        command,
        commandOptions(req),
      ),
      'Product review updated',
    );
  } catch (error) {
    return next(error);
  }
}

async function setPublication(req, res, next) {
  try {
    const command = commandFrom(req.body, ['publicationStatus', 'expectedVersion']);
    return sendSuccess(
      res,
      await reviewService.setPublication(
        req.user,
        req.params.reviewId,
        command,
        commandOptions(req),
      ),
      'Review publication updated',
    );
  } catch (error) {
    return next(error);
  }
}

async function listModeration(req, res, next) {
  try {
    return sendSuccess(
      res,
      await reviewService.listModeration(req.user, req.query),
    );
  } catch (error) {
    return next(error);
  }
}

async function moderate(req, res, next) {
  try {
    const command = commandFrom(req.body, [
      'moderationStatus',
      'reason',
      'expectedVersion',
    ]);
    return sendSuccess(
      res,
      await reviewService.moderate(
        req.user,
        req.params.reviewId,
        command,
        commandOptions(req),
      ),
      'Review moderation updated',
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listPublic,
  listOwn,
  createReview,
  updateReview,
  setPublication,
  listModeration,
  moderate,
};
