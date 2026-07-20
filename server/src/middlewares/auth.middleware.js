const User = require('../models/user.model');
const { verifyAuthToken } = require('../utils/jwt');
const { sendError } = require('../utils/apiResponse');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return sendError(res, 'Unauthorized: missing token', 401);
    }

    const payload = verifyAuthToken(token, process.env.JWT_SECRET || 'greenhome-dev-secret');
    const user = await User.findById(payload.sub).populate('roleId').lean();
    if (!user || user.status === 'Disabled') {
      return sendError(res, 'Unauthorized: invalid account', 401);
    }

    req.user = {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber || user.phone || '',
      address: user.address || '',
      avatarUrl: user.avatarUrl || '',
      status: user.status,
      role: user.roleId.roleName,
    };
    return next();
  } catch (error) {
    return sendError(res, 'Unauthorized: invalid token', 401);
  }
}

module.exports = {
  authenticate,
};
