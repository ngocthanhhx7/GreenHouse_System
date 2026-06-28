const { authService } = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');

async function register(req, res, next) {
  try {
    const result = await authService.registerCustomer(req.body);
    return sendSuccess(res, result, 'Account registered successfully', 201);
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    return sendSuccess(res, result, 'Login successful');
  } catch (error) {
    return next(error);
  }
}

async function me(req, res) {
  return sendSuccess(res, { user: req.user }, 'Current user loaded');
}

async function logout(req, res) {
  return sendSuccess(res, null, 'Logout successful');
}

module.exports = {
  register,
  login,
  me,
  logout,
};
