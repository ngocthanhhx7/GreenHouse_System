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

module.exports = { validateRequest };
