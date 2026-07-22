const User = require('../models/user.model');
const { verifyAuthToken } = require('../utils/jwt');
const { sendError } = require('../utils/apiResponse');

function createAuthenticate({
  verifyToken = (token) => verifyAuthToken(token, process.env.JWT_SECRET || 'greenhome-dev-secret'),
  findUserById = async (id) => User.findById(id).populate('roleId').lean(),
} = {}) {
  return async function authenticateRequest(req, res, next) {
    try {
      const header = req.headers.authorization || '';
      const [scheme, token] = header.split(' ');
      if (scheme !== 'Bearer' || !token) return sendError(res, 'Thiếu token đăng nhập.', 401, [], 'AUTH_TOKEN_MISSING', req);

      const payload = verifyToken(token);
      const user = await findUserById(payload.sub);
      if (!user || user.status === 'Disabled') return sendError(res, 'Tài khoản không hợp lệ hoặc đã bị vô hiệu hóa.', 401, [], 'AUTH_ACCOUNT_INVALID', req);

      const passwordVersion = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
      if (Number(payload.pwd || 0) !== passwordVersion) {
        return sendError(res, 'Mật khẩu đã thay đổi. Vui lòng đăng nhập lại.', 401, [], 'AUTH_TOKEN_STALE', req);
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
      return sendError(res, 'Token đăng nhập không hợp lệ hoặc đã hết hạn.', 401, [], 'AUTH_TOKEN_INVALID', req);
    }
  };
}

const authenticate = createAuthenticate();

module.exports = { authenticate, createAuthenticate };
