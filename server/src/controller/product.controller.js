const { productService } = require('../services/product.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listPublic(req, res, next) {
  try {
    return sendSuccess(res, await productService.listPublicProducts(req.query));
  } catch (error) {
    return next(error);
  }
}

async function getPublicById(req, res, next) {
  try {
    return sendSuccess(res, await productService.getPublicProductById(req.params.id));
  } catch (error) {
    return next(error);
  }
}

async function listAdmin(req, res, next) {
  try {
    return sendSuccess(res, await productService.listAdminProducts());
  } catch (error) {
    return next(error);
  }
}

async function create(req, res, next) {
  try {
    return sendSuccess(res, await productService.createProduct(req.body, req.user), 'Product created', 201);
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    return sendSuccess(res, await productService.updateProduct(req.params.id, req.body, req.user), 'Product updated');
  } catch (error) {
    return next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    return sendSuccess(res, await productService.updateProduct(req.params.id, { status: req.body.status }, req.user), 'Product status updated');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listPublic,
  getPublicById,
  listAdmin,
  create,
  update,
  updateStatus,
};
