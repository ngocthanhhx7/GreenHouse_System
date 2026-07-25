const mongoose = require('mongoose');
const { sendError } = require('../utils/apiResponse');
const { validate } = require('../validation/requestValidation');

function validateRequest(schema) {
  return (req, res, next) => {
    const result = validate(req.body, schema);
    if (result.errors.length) {
      return sendError(res, 'Dữ liệu yêu cầu không hợp lệ', 400, result.errors, 'VALIDATION_ERROR', req);
    }
    req.body = result.value;
    return next();
  };
}

function validateObjectIdParam(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params?.[paramName];
    if (!mongoose.isObjectIdOrHexString(value)) {
      return sendError(
        res,
        'Mã định danh không hợp lệ',
        400,
        [{ field: paramName, message: 'Mã định danh không hợp lệ' }],
        'INVALID_ID',
        req,
      );
    }
    return next();
  };
}

module.exports = { validateObjectIdParam, validateRequest };
