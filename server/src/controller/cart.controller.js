const { cartService } = require('../services/cart.service');
const { sendSuccess } = require('../utils/apiResponse');

async function getCart(req, res, next) {
  try {
    return sendSuccess(res, await cartService.getCart(req.user.id));
  } catch (error) {
    return next(error);
  }
}

async function addItem(req, res, next) {
  try {
    return sendSuccess(res, await cartService.addItem(req.user.id, req.body), 'Cart item added', 201);
  } catch (error) {
    return next(error);
  }
}

async function updateItem(req, res, next) {
  try {
    return sendSuccess(res, await cartService.updateItem(req.user.id, req.params.id, req.body), 'Cart item updated');
  } catch (error) {
    return next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    return sendSuccess(res, await cartService.removeItem(req.user.id, req.params.id), 'Cart item removed');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
};
