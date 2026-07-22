const { authService } = require('../services/auth.service');
const { sendSuccess } = require('../utils/apiResponse');
const { createEmailOutboxService } = require('../services/email.service');
const { createPasswordResetService } = require('../services/passwordReset.service');

const passwordResetService = createPasswordResetService({ outboxService: createEmailOutboxService() });

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

async function forgotPassword(req, res, next) {
  try {
    const result = await passwordResetService.requestReset(req.body.email);
    return sendSuccess(res, null, result.message);
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const result = await passwordResetService.resetPassword(req.body);
    return sendSuccess(res, null, result.message);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  me,
  logout,
  forgotPassword,
  resetPassword,
};
