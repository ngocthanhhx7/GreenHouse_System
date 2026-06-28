function sendSuccess(res, data = null, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    errors: [],
  });
}

function sendError(res, message = 'Something went wrong', statusCode = 500, errors = []) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    errors,
  });
}

module.exports = {
  sendSuccess,
  sendError,
};
