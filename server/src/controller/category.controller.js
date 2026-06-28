const { categoryService } = require('../services/category.service');
const { sendSuccess } = require('../utils/apiResponse');

async function listPublic(req, res, next) {
  try {
    return sendSuccess(res, await categoryService.listPublicCategories());
  } catch (error) {
    return next(error);
  }
}

async function listAdmin(req, res, next) {
  try {
    return sendSuccess(res, await categoryService.listAdminCategories());
  } catch (error) {
    return next(error);
  }
}

async function create(req, res, next) {
  try {
    return sendSuccess(res, await categoryService.createCategory(req.body, req.user), 'Category created', 201);
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    return sendSuccess(res, await categoryService.updateCategory(req.params.id, req.body, req.user), 'Category updated');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listPublic,
  listAdmin,
  create,
  update,
};
